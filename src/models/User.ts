import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  image?: string;
  plan: 'free' | 'pro';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  messagesUsedThisMonth: number;
  messagesResetAt: Date;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, select: false },
  image: String,
  plan: { type: String, enum: ['free', 'pro'], default: 'free' },
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  messagesUsedThisMonth: { type: Number, default: 0 },
  messagesResetAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
