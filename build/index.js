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
setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
    yield connect();
    // --- Vote expiry (existing logic) ---
    const votes = yield VoteModel.find({ current: true });
    for (const vote of votes) {
        console.log(`Checking vote ${vote.title} with end date ${vote.end_date}`);
        if (new Date(vote.end_date) < new Date()) {
            vote.current = false;
            vote.end_date = new Date(vote.end_date);
            vote.save();
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
