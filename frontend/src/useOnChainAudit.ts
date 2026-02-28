import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { MONAD_TESTNET, CONTRACT_ADDRESS, SHADOWBET_ABI } from "./contract";

export interface AuditEvent {
  blockNumber: number;
  txHash: string;
  marketId: number;
  user: string;
  amount: bigint;
}

export interface AuditData {
  events: AuditEvent[];
  totalBets: number;
  totalVolume: bigint;
  betsByMarket: Record<number, number>;
  loading: boolean;
  error: string | null;
}

const provider = new ethers.JsonRpcProvider(MONAD_TESTNET.rpcUrl);
const contract = new ethers.Contract(CONTRACT_ADDRESS, SHADOWBET_ABI, provider);

const CHUNK_SIZE = 1000; // Monad eth_getLogs limit
const MAX_CHUNKS = 200; // ~200k blocks ≈ 22 hours of history

export function useOnChainAudit(): AuditData {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [totalBets, setTotalBets] = useState(0);
  const [totalVolume, setTotalVolume] = useState<bigint>(0n);
  const [betsByMarket, setBetsByMarket] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchEvents() {
      try {
        const currentBlock = await provider.getBlockNumber();
        const filter = contract.filters.BetPlaced();
        const allEvents: ethers.EventLog[] = [];

        // Query backwards from latest block in chunks of 1000
        for (let i = 0; i < MAX_CHUNKS; i++) {
          const toBlock = currentBlock - i * CHUNK_SIZE;
          const fromBlock = Math.max(0, toBlock - CHUNK_SIZE + 1);

          if (toBlock < 0) break;

          try {
            const chunk = (await contract.queryFilter(
              filter,
              fromBlock,
              toBlock
            )) as ethers.EventLog[];
            allEvents.push(...chunk);
          } catch {
            // Single chunk failure — skip and continue
            continue;
          }

          // Early exit: if we found events and have gone back far enough
          // (at least 10 chunks = 10k blocks after first event)
          if (allEvents.length > 0 && i >= 10) break;

          if (fromBlock === 0) break;
        }

        if (cancelled) return;

        const parsed: AuditEvent[] = allEvents.map((e) => ({
          blockNumber: e.blockNumber,
          txHash: e.transactionHash,
          marketId: Number(e.args[0]),
          user: e.args[1] as string,
          amount: e.args[2] as bigint,
        }));

        // Sort by block descending (most recent first)
        parsed.sort((a, b) => b.blockNumber - a.blockNumber);

        // Deduplicate by txHash (in case chunks overlap)
        const seen = new Set<string>();
        const unique = parsed.filter((ev) => {
          if (seen.has(ev.txHash)) return false;
          seen.add(ev.txHash);
          return true;
        });

        const volume = unique.reduce((sum, ev) => sum + ev.amount, 0n);

        // Count bets per market
        const perMarket: Record<number, number> = {};
        unique.forEach(ev => {
          perMarket[ev.marketId] = (perMarket[ev.marketId] || 0) + 1;
        });

        setEvents(unique.slice(0, 20));
        setTotalBets(unique.length);
        setTotalVolume(volume);
        setBetsByMarket(perMarket);
        setError(null);
      } catch (err: any) {
        if (!cancelled) {
          setError("Unable to fetch on-chain data");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchEvents();
    return () => {
      cancelled = true;
    };
  }, []);

  return { events, totalBets, totalVolume, betsByMarket, loading, error };
}
