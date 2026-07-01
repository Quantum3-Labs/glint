import { Barretenberg, Fr } from "@aztec/bb.js";

const R =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const mod = (x: bigint) => ((x % R) + R) % R;

const want = {
  "h2(1,2)":
    1594597865669602199208529098208508950092942746041644072252494753744672355203n,
  "h3(1,2,3)": mod(
    -5820019028964090540034222680737130897730565840627999924672172762808150311465n,
  ),
  "h2(0,0)":
    5151499478991301833156025595048985053689893395646836724335623777508747990769n,
};

async function main() {
  const bb = await Barretenberg.new();
  const h = async (vals: bigint[]) => {
    const r = await bb.poseidon2Hash(vals.map((v) => new Fr(mod(v))));
    return BigInt(r.toString());
  };
  const got = {
    "h2(1,2)": await h([1n, 2n]),
    "h3(1,2,3)": await h([1n, 2n, 3n]),
    "h2(0,0)": await h([0n, 0n]),
  };
  for (const k of Object.keys(want) as (keyof typeof want)[]) {
    const ok = got[k] === want[k];
    console.log(
      `${ok ? "MATCH " : "DIFFER"} ${k}: got=${got[k]} want=${want[k]}`,
    );
  }
  await bb.destroy();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
