"use server";

// Gmail, on demand. "Check Gmail now" reads recent emails from known bank and merchant
// senders and returns drafts to the browser for review. Nothing from the emails is stored:
// confirmed drafts are saved through confirmImport (source "gmail", source_ref = message
// id), and hidden ones are remembered by message id only. Email text, subjects and tokens
// are never logged.
import { detectMessage, type Detection } from "@/lib/capture/detect-message";
import { requireUser } from "@/lib/data";
import { istToday, type ISODate } from "@/lib/engine/dates";
import { gmailConfig } from "@/lib/gmail/config";
import { decryptToken } from "@/lib/gmail/crypto";
import { getMessage, GoogleError, listMessageIds, refreshAccessToken, revokeToken } from "@/lib/gmail/google";
import { header, messageText, receivedOn, searchQuery, senderName } from "@/lib/gmail/message";

const MAX_MESSAGES = 25;
const PARALLEL = 5;
const MESSAGE_ID = /^[0-9a-zA-Z_-]{6,64}$/;

export interface GmailStatus {
  available: boolean; // the Gmail settings are configured on the server
  connection: { email: string; status: "connected" | "needs_reconnect"; lastCheckedAt: string | null } | null;
}

export interface GmailItem {
  messageId: string;
  sender: string;
  subject: string;
  receivedOn: ISODate | null;
  snippet: string; // Google's own short preview, shown while reviewing and never stored
  detection: Extract<Detection, { type: "transaction" | "card_statement" }>;
}

export interface GmailCheckResult {
  items?: GmailItem[];
  checked?: number;
  skipped?: number; // OTPs, adverts, failed payments and other non-transactions
  alreadyHandled?: number; // saved or hidden earlier
  needsReconnect?: boolean;
  error?: string;
}

export async function getGmailStatus(): Promise<GmailStatus> {
  const { supabase } = await requireUser();
  const available = gmailConfig() !== null;
  const { data } = await supabase.from("gmail_connections").select("google_email, status, last_checked_at").maybeSingle();
  return {
    available,
    connection: data ? { email: data.google_email, status: data.status, lastCheckedAt: data.last_checked_at } : null,
  };
}

export async function checkGmail(): Promise<GmailCheckResult> {
  const { supabase, userId } = await requireUser();
  const config = gmailConfig();
  if (!config) return { error: "Gmail isn't switched on for MoneyMap yet." };

  const { data: conn } = await supabase.from("gmail_connections").select("encrypted_refresh_token, status").maybeSingle();
  if (!conn) return { error: "Connect Gmail first." };
  const refreshToken = decryptToken(conn.encrypted_refresh_token, config.tokenKey, userId);
  if (!refreshToken || conn.status === "needs_reconnect") return { needsReconnect: true };

  try {
    const accessToken = await refreshAccessToken(config, refreshToken);
    const ids = await listMessageIds(config, accessToken, searchQuery(), MAX_MESSAGES);

    // Skip emails already saved as transactions or hidden by the user, without opening them.
    const [{ data: saved }, { data: hidden }] = ids.length
      ? await Promise.all([
          supabase.from("transactions").select("source_ref").eq("source", "gmail").in("source_ref", ids),
          supabase.from("gmail_dismissed").select("message_id").in("message_id", ids),
        ])
      : [{ data: [] }, { data: [] }];
    const handled = new Set([...(saved ?? []).map((r) => r.source_ref), ...(hidden ?? []).map((r) => r.message_id)]);
    const fresh = ids.filter((id) => !handled.has(id));

    const today = istToday();
    const items: GmailItem[] = [];
    let skipped = 0;
    for (let i = 0; i < fresh.length; i += PARALLEL) {
      const messages = await Promise.all(fresh.slice(i, i + PARALLEL).map((id) => getMessage(config, accessToken, id)));
      for (const m of messages) {
        const from = header(m, "From");
        const subject = header(m, "Subject").slice(0, 200);
        const detection = detectMessage({ source: "gmail", messageId: m.id, from, subject, body: messageText(m), receivedOn: receivedOn(m) }, today);
        if (detection.type === "ignore") {
          skipped += 1;
          continue;
        }
        if (detection.type === "transaction") detection.proposal.raw = ""; // the snippet is shown instead
        items.push({ messageId: m.id, sender: senderName(from).slice(0, 80), subject, receivedOn: receivedOn(m) ?? null, snippet: (m.snippet ?? "").slice(0, 200), detection });
      }
    }

    await supabase.from("gmail_connections").update({ last_checked_at: new Date().toISOString() }).eq("user_id", userId);
    return { items, checked: ids.length, skipped, alreadyHandled: ids.length - fresh.length };
  } catch (e) {
    if (e instanceof GoogleError && e.code === "revoked") {
      await supabase.from("gmail_connections").update({ status: "needs_reconnect" }).eq("user_id", userId);
      return { needsReconnect: true };
    }
    return { error: "Couldn't reach Gmail. Nothing was changed; try again in a minute." };
  }
}

// "Not a transaction": remember only the message id, so the next check skips it.
export async function hideGmailMessages(messageIds: string[]): Promise<{ error?: string }> {
  const { supabase } = await requireUser();
  const ids = Array.isArray(messageIds) ? messageIds.filter((id) => typeof id === "string" && MESSAGE_ID.test(id)).slice(0, 100) : [];
  if (!ids.length) return {};
  const { error } = await supabase.from("gmail_dismissed").upsert(ids.map((message_id) => ({ message_id })), { onConflict: "user_id,message_id", ignoreDuplicates: true });
  return error ? { error: "Couldn't hide that email. Try again." } : {};
}

// Revokes MoneyMap's access at Google and deletes everything Gmail-related MoneyMap holds:
// the encrypted token and the hidden-message ids. Transactions the user confirmed stay,
// like any other saved entry.
export async function disconnectGmail(): Promise<{ revoked: boolean; error?: string }> {
  const { supabase, userId } = await requireUser();
  const config = gmailConfig();
  const { data: conn } = await supabase.from("gmail_connections").select("encrypted_refresh_token").maybeSingle();
  let revoked = false;
  if (conn && config) {
    const token = decryptToken(conn.encrypted_refresh_token, config.tokenKey, userId);
    if (token) revoked = await revokeToken(config, token);
  }
  const [a, b] = await Promise.all([
    supabase.from("gmail_connections").delete().eq("user_id", userId),
    supabase.from("gmail_dismissed").delete().eq("user_id", userId),
  ]);
  if (a.error || b.error) return { revoked, error: "Couldn't finish disconnecting. Try again." };
  return { revoked };
}
