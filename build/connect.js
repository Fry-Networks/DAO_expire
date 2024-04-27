var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import mongoose from 'mongoose';
import 'dotenv/config';
let connection = null;
export function connect() {
    return __awaiter(this, void 0, void 0, function* () {
        //check if connected
        if (mongoose.connection.readyState >= 1) {
            return;
        }
        const uri = process.env.MONGO_URI;
        if (!uri) {
            throw new Error('MONGO_URI not set!');
        }
        console.log('Connecting to MongoDB...');
        mongoose.connection.on('connected', () => {
            console.log('Connected to MongoDB!');
        });
        connection = yield mongoose.connect(uri);
        mongoose.connection.useDb('main');
        mongoose.connection.on('error', (err) => {
            console.error(`Mongoose connection error:\n${err.stack}`);
        });
        mongoose.connection.on('disconnected', () => {
            console.log('Disconnected from MongoDB!');
        });
    });
}
export function getConnection() {
    if (connection === null) {
        throw new Error('Not connected to MongoDB!');
    }
    return connection;
}
