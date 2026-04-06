import mongoose from "mongoose";
export const voteSchema = new mongoose.Schema({
    end_date: Date,
    total_votes: { type: Number, default: 0 },
    hadVotes: { type: Boolean, default: false },
    createdAt: { type: String, default: Date.now },
    editedAt: Date,
    deleted: { type: Boolean, default: false },
    current: { type: Boolean, default: false },
    title: String,
    description: String,
    type: String,
    status: String,
    votes: [
        {
            option: String,
            description: String,
            title: String,
            votes: { type: Number, default: 0 },
            different_people: { type: [String], default: [] }
        }
    ]
});
export const VoteModel = mongoose.model('Vote', voteSchema, 'dao');
