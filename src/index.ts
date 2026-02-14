import { connect } from "./connect.js";
import { VoteModel } from "./vote-schema.js";
import 'dotenv/config'
setInterval(async () => {
    await connect();
    const votes = await VoteModel.find({current: true});
    for (const vote of votes) {
        console.log(`Checking vote ${vote.title} with end date ${vote.end_date}`);
        if (new Date(vote.end_date) < new Date()) {
            vote.current = false;
            vote.end_date = new Date(vote.end_date);
            vote.save();
            console.log(`Vote ${vote.title} has ended`);
        }
    }
}, 60000);
