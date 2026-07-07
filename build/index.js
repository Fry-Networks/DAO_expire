var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { connect } from "./connect.js";
import { VoteModel } from "./vote-schema.js";
import 'dotenv/config';
const STALE_CFIP_DAYS = 30;
// On-chain conclusion sync (FryGovernance V2). Contract votes are cast
// on-chain only, so the Mongo tallies / different_people / hadVotes that
// the /votes finished lists depend on must be filled from chain state
// when the vote ends.
const GOVERNANCE_APP_ID = 3594179146;
const ALGOD_BASE = 'https://mainnet-api.4160.nodely.dev';
const INDEXER_BASE = 'https://mainnet-idx.4160.nodely.dev';
const CAST_VOTE_SELECTOR = 'b239e8c4';
function syncContractVote(vote) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        const voteIdHex = vote.contractVoteId;
        if (!voteIdHex || voteIdHex.length !== 64)
            return;
        const boxName = Buffer.concat([Buffer.from([0x76]), Buffer.from(voteIdHex, 'hex')]);
        const boxRes = yield fetch(`${ALGOD_BASE}/v2/applications/${GOVERNANCE_APP_ID}/box?name=b64:${encodeURIComponent(boxName.toString('base64'))}`);
        if (!boxRes.ok)
            throw new Error(`box fetch HTTP ${boxRes.status}`);
        const box = Buffer.from((yield boxRes.json()).value, 'base64');
        // V2 vote box: id(32) created(8) end(8) lock(8) options(8) super(8) totalTokens[4]@72 totalVoters[4]@104
        const tokens = [];
        const voters = [];
        for (let i = 0; i < 4; i++) {
            tokens.push(Number(box.readBigUInt64BE(72 + i * 8)));
            voters.push(Number(box.readBigUInt64BE(104 + i * 8)));
        }
        // Voter addresses per option from indexer cast_vote txns
        const perOption = {};
        let next = '';
        for (let page = 0; page < 5; page++) {
            const url = `${INDEXER_BASE}/v2/transactions?application-id=${GOVERNANCE_APP_ID}&limit=1000` + (next ? `&next=${encodeURIComponent(next)}` : '');
            const idxRes = yield fetch(url);
            if (!idxRes.ok)
                throw new Error(`indexer HTTP ${idxRes.status}`);
            const data = yield idxRes.json();
            const txns = ((_a = data.transactions) !== null && _a !== void 0 ? _a : []);
            for (const t of txns) {
                const args = (_c = (_b = t['application-transaction']) === null || _b === void 0 ? void 0 : _b['application-args']) !== null && _c !== void 0 ? _c : [];
                if (args.length < 3)
                    continue;
                if (Buffer.from(args[0], 'base64').toString('hex') !== CAST_VOTE_SELECTOR)
                    continue;
                if (Buffer.from(args[1], 'base64').toString('hex') !== voteIdHex)
                    continue;
                const opt = (_d = Buffer.from(args[2], 'base64')[0]) !== null && _d !== void 0 ? _d : 0;
                const list = (_e = perOption[opt]) !== null && _e !== void 0 ? _e : (perOption[opt] = []);
                if (list.indexOf(t.sender) === -1)
                    list.push(t.sender);
            }
            next = data['next-token'];
            if (!next || txns.length === 0)
                break;
        }
        let hadAny = false;
        vote.votes.forEach((opt, i) => {
            var _a, _b;
            const people = (_a = perOption[i]) !== null && _a !== void 0 ? _a : [];
            const fry = Math.round(((_b = tokens[i]) !== null && _b !== void 0 ? _b : 0) / 1e6);
            if (people.length > 0 || fry > 0)
                hadAny = true;
            opt.votes = fry;
            opt.different_people = people;
        });
        if (hadAny)
            vote.hadVotes = true;
        vote.markModified('votes');
        console.log(`[dao_expire] chain-synced "${vote.title}": tokens=${tokens.join(',')} voters=${voters.join(',')} people=${vote.votes.map(o => o.different_people.length).join(',')}`);
    });
}
setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
    yield connect();
    // --- Vote expiry (existing logic) ---
    const votes = yield VoteModel.find({ current: true });
    for (const vote of votes) {
        console.log(`Checking vote ${vote.title} with end date ${vote.end_date}`);
        if (new Date(vote.end_date) < new Date()) {
            // Fill tallies from chain for contract votes BEFORE the flip,
            // so the finished lists render real numbers immediately.
            try {
                yield syncContractVote(vote);
            }
            catch (e) {
                console.error(`[dao_expire] chain sync FAILED for "${vote.title}":`, e.message);
            }
            // Safety net: participation already recorded in Mongo but hadVotes never set
            if (!vote.hadVotes && vote.votes.some(o => { var _a, _b; return o.votes > 0 || ((_b = (_a = o.different_people) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) > 0; })) {
                vote.hadVotes = true;
            }
            vote.current = false;
            yield vote.save();
            console.log(`Vote ${vote.title} has ended`);
        }
    }
    // --- Stale cFIP archival (new logic) ---
    const staleCutoff = new Date(Date.now() - STALE_CFIP_DAYS * 24 * 60 * 60 * 1000);
    // Find cFIPs in discussion status
    const discussionCfips = yield VoteModel.find({
        type: 'cfip',
        status: 'discussion'
    });
    for (const cfip of discussionCfips) {
        // Determine last activity date
        let lastActivity;
        if (cfip.editedAt) {
            lastActivity = new Date(cfip.editedAt);
        }
        else if (cfip.createdAt) {
            lastActivity = new Date(cfip.createdAt);
        }
        else {
            continue; // No date to compare, skip
        }
        // Check if stale (no activity in STALE_CFIP_DAYS)
        if (lastActivity < staleCutoff) {
            console.log(`[dao_expire] Archiving stale cFIP: ${cfip.title} (${cfip._id}) - last activity: ${lastActivity.toISOString()}`);
            cfip.status = 'archived';
            yield cfip.save();
            console.log(`[dao_expire] Archived stale cFIP: ${cfip.title}`);
        }
    }
}), 60000);
