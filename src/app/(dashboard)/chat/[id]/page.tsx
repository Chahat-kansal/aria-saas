import { ChatWindow } from '@/components/chat/ChatWindow';

export default function ConversationPage({ params }: { params: { id: string } }) {
  return <div className="h-full flex flex-col"><ChatWindow conversationId={params.id} /></div>;
}
