import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  fileUrl?: string;
  fileName?: string;
}

export interface IConversation extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  messages: IMessage[];
  aimodel: string;
  createdAt: Date;
  updatedAt: Date;
  shareToken?: string;
  parentConversationId?: string;
  branchPoint?: number;
  tone?: string;
}

const MessageSchema = new Schema<IMessage>({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  shareToken: { type: String, index: { sparse: true } },
  parentConversationId: String,
  branchPoint: Number,
  tone: { type: String, default: 'default' },
  fileUrl: String,
  fileName: String,
});

const ConversationSchema = new Schema<IConversation>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, default: 'New conversation' },
  messages: [MessageSchema],
  aimodel: { type: String, default: 'claude-sonnet-4-20250514' },

  
  shareToken: { type: String, index: { sparse: true } },
  parentConversationId: String,
  branchPoint: Number,
  tone: { type: String, default: 'default' },
}, { timestamps: true });

export const Conversation = mongoose.models.Conversation || mongoose.model<IConversation>('Conversation', ConversationSchema);
