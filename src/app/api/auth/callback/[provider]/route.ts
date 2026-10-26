import { auth } from "@/lib/auth";

/**
 * Where Google sends people back to after they have logged in there. Better
 * Auth checks what Google sends, then sets the login cookie.
 *
 * This is the only one of Better Auth's own addresses the app answers (see
 * auth.ts). Google sends people back with an ordinary link, so only GET.
 */
export function GET(request: Request) {
  return auth.handler(request);
}
