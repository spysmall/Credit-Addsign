/**
 * Build flavour. The test site at /Credit-Addsign/beta is built with NEXT_PUBLIC_APP_ENV=beta:
 * it reads the real sheets but never writes back (no Apps Script URL), and edits are locked so
 * testers can't change numbers the live site also keeps in this browser's localStorage.
 */
export const IS_BETA = process.env.NEXT_PUBLIC_APP_ENV === "beta";
