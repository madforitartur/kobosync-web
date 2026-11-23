import { redirect } from "next/navigation";

/** A lista de PDFs passou a ser a vista "PDF" da biblioteca. */
export default function PdfRedirect() {
  redirect("/?formato=pdf");
}
