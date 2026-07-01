import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-helpers";

/**
 * GET /api/patronage/config
 *
 * Exposes the public pool config the browser needs to build a deposit
 * transaction: the contract id and the Soroban RPC url. Read from server env at
 * runtime, so it works on Cloud Run without baking NEXT_PUBLIC_* at build time.
 */
export function GET() {
  const contractId = process.env.PATRONAGE_CONTRACT_ID;
  if (!contractId) {
    return serverError("PATRONAGE_CONTRACT_ID is not set");
  }
  return NextResponse.json({
    contractId,
    rpcUrl:
      process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ??
      "https://soroban-testnet.stellar.org",
  });
}
