import { redirect } from "next/navigation";

// Notifications link to a contract. The list holds its status and signing link.
export default function PortalContractPage() {
  redirect("/portal/contracts");
}
