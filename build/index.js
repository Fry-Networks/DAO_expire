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
setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
    yield connect();
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
}), 60000);
