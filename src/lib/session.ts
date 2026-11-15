import { headers } from "next/headers";
import { ADMIN_ID, USER_HEADER } from "@/lib/auth";

/** Id do utilizador autenticado (definido pelo proxy). */
export async function currentUserId(): Promise<string> {
  return (await headers()).get(USER_HEADER) ?? ADMIN_ID;
}
