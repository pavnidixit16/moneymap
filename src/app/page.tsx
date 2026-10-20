import { redirect } from "next/navigation";

// The proxy already sends signed-out visitors to /login.
export default function Home() {
  redirect("/overview");
}
