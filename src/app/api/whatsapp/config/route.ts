import { whatsappEnabled } from "@/lib/whatsapp/policy";
export function GET() {
  return Response.json({available:whatsappEnabled()},{headers:{"Cache-Control":"no-store"}});
}
