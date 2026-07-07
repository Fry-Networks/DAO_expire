import { connect } from "./connect.js";
import { VoteModel, Vote } from "./vote-schema.js";
import 'dotenv/config'

declare const fetch: any;

const STALE_CFIP_DAYS = 30;

// On-chain conclusion sync (FryGovernance V2). Contract votes are cast
// on-chain only, so the Mongo tallies / different_people / hadVotes that
// the /votes finished lists depend on must be filled from chain state
// when the vote ends.
const GOVERNANCE_APP_ID = 3594179146;
const ALGOD_BASE = 'https://mainnet-api.4160.nodely.dev';
const INDEXER_BASE = 'https://mainnet-idx.4160.nodely.dev';
const CAST_VOTE_SELECTOR = 'b239e8c4';

async function syncContractVote(vote: Vote): Promise<void> {
    const voteIdHex = vote.contractVoteId;
    if (!voteIdHex || voteIdHex.length !== 64) return;
    const boxName = Buffer.concat([Buffer.from([0x76]), Buffer.from(voteIdHex, 'hex')]);
    const boxRes = await fetch(`${ALGOD_BASE}/v2/applications/${GOVERNANCE_APP_ID}/box?name=b64:${encodeURIComponent(boxName.toString('base64'))}`);
    if (!boxRes.ok) throw new Error(`box fetch HTTP ${boxRes.status}`);
    const box = Buffer.from((await boxRes.json()).value, 'base64');
    // V2 vote box: id(32) created(8) end(8) lock(8) options(8) super(8) totalTokens[4]@72 totalVoters[4]@104
    const tokens: number[] = [];
    const voters: number[] = [];
    for (let i = 0; i < 4; i++) {
        tokens.push(Number(box.readBigUInt64BE(72 + i * 8)));
        voters.push(Number(box.readBigUInt64BE(104 + i * 8)));
    }
    // Voter addresses per option from indexer cast_vote txns
    const perOption: Record<number, string[]> = {};
    let next = '';
    for (let page = 0; page < 5; page++) {
        const url = `${INDEXER_BASE}/v2/transactions?application-id=${GOVERNANCE_APP_ID}&limit=1000` + (next ? `&next=${encodeURIComponent(next)}` : '');
        const idxRes = await fetch(url);
        if (!idxRes.ok) throw new Error(`indexer HTTP ${idxRes.status}`);
        const data = await idxRes.json();
        const txns = (data.transactions ?? []) as any[];
        for (const t of txns) {
            const args: string[] = t['application-transaction']?.['application-args'] ?? [];
            if (args.length < 3) continue;
            if (Buffer.from(args[0], 'base64').toString('hex') !== CAST_VOTE_SELECTOR) continue;
            if (Buffer.from(args[1], 'base64').toString('hex') !== voteIdHex) continue;
            const opt = Buffer.from(args[2], 'base64')[0] ?? 0;
            const list = perOption[opt] ?? (perOption[opt] = []);
            if (list.indexOf(t.sender) === -1) list.push(t.sender);
        }
        next = data['next-token'];
        if (!next || txns.length === 0) break;
    }
    let hadAny = false;
    vote.votes.forEach((opt, i) => {
        const people = perOption[i] ?? [];
        const fry = Math.round((tokens[i] ?? 0) / 1e6);
        if (people.length > 0 || fry > 0) hadAny = true;
        opt.votes = fry;
        opt.different_people = people;
    });
    if (hadAny) vote.hadVotes = true;
    vote.markModified('votes');
    console.log(`[dao_expire] chain-synced "${vote.title}": tokens=${tokens.join(',')} voters=${voters.join(',')} people=${vote.votes.map(o => o.different_people.length).join(',')}`);
}

setInterval(async () => {
    await connect();

    // --- Vote expiry (existing logic) ---
    const votes = await VoteModel.find({current: true});
    for (const vote of votes) {
        console.log(`Checking vote ${vote.title} with end date ${vote.end_date}`);
        if (new Date(vote.end_date) < new Date()) {
            // Fill tallies from chain for contract votes BEFORE the flip,
            // so the finished lists render real numbers immediately.
            try {
                await syncContractVote(vote);
            } catch (e) {
                console.error(`[dao_expire] chain sync FAILED for "${vote.title}":`, (e as Error).message);
            }
            // Safety net: participation already recorded in Mongo but hadVotes never set
            if (!vote.hadVotes && vote.votes.some(o => o.votes > 0 || (o.different_people?.length ?? 0) > 0)) {
                vote.hadVotes = true;
            }
            vote.current = false;
            await vote.save();
            console.log(`Vote ${vote.title} has ended`);
        }
    }

    // --- Stale cFIP archival (new logic) ---
    const staleCutoff = new Date(Date.now() - STALE_CFIP_DAYS * 24 * 60 * 60 * 1000);

    // Find cFIPs in discussion status
    const discussionCfips = await VoteModel.find({
        type: 'cfip',
        status: 'discussion'
    });

    for (const cfip of discussionCfips) {
        // Determine last activity date
        let lastActivity: Date;
        if (cfip.editedAt) {
            lastActivity = new Date(cfip.editedAt);
        } else if (cfip.createdAt) {
            lastActivity = new Date(cfip.createdAt);
        } else {
            continue; // No date to compare, skip
        }

        // Check if stale (no activity in STALE_CFIP_DAYS)
        if (lastActivity < staleCutoff) {
            console.log(`[dao_expire] Archiving stale cFIP: ${cfip.title} (${cfip._id}) - last activity: ${lastActivity.toISOString()}`);
            cfip.status = 'archived';
            await cfip.save();
            console.log(`[dao_expire] Archived stale cFIP: ${cfip.title}`);
        }
    }
}, 60000);
