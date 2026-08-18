import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RippleButton } from '@/components/ui/ripple-button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { fireSideConfetti } from '@/utils/confetti';
import { Send, Bot, User, MessageSquare } from 'lucide-react';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: string;
}

interface OfficerChatProps {
  agentEmail: string;
}

const OfficerChat = ({ agentEmail }: OfficerChatProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load chat history on mount
  useEffect(() => {
    const loadChatHistory = async () => {
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
          const loadedMessages: Message[] = data.map(msg => ({
            id: msg.id,
            content: msg.content,
            sender: msg.role === 'user' ? 'user' : 'ai',
            timestamp: msg.created_at,
          }));
          setMessages(loadedMessages);
        } else {
          // Add welcome message if no history
          const welcomeMessage: Message = {
            id: '1',
            content: 'Hello! I\'m your AI assistant. I can help you with policy information, procedures, client management, and general questions. How can I assist you today?',
            sender: 'ai',
            timestamp: new Date().toISOString()
          };
          setMessages([welcomeMessage]);
        }
      } catch (error) {
        console.error('Error loading chat history:', error);
        toast({
          title: "Error",
          description: "Failed to load chat history",
          variant: "destructive",
        });
        // Add welcome message on error
        const welcomeMessage: Message = {
          id: '1',
          content: 'Hello! I\'m your AI assistant. I can help you with policy information, procedures, client management, and general questions. How can I assist you today?',
          sender: 'ai',
          timestamp: new Date().toISOString()
        };
        setMessages([welcomeMessage]);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadChatHistory();
  }, [toast]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const messageText = input;
    const userMessage: Message = {
      id: Date.now().toString(),
      content: messageText,
      sender: 'user',
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Save user message to database
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error: userMsgError } = await supabase
          .from('chat_messages')
          .insert({
            user_id: user.id,
            role: 'user',
            content: messageText,
          });

        if (userMsgError) {
          console.error('Error saving user message:', userMsgError);
        }
      }

      // Get AI response
      const { data, error } = await supabase.functions.invoke('officer-chat', {
        body: {
          message: messageText,
          agentEmail
        }
      });

      if (error) throw error;

      const aiResponse = data.response || 'I apologize, but I couldn\'t generate a response.';
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: aiResponse,
        sender: 'ai',
        timestamp: data.timestamp || new Date().toISOString()
      };

      setMessages(prev => [...prev, aiMessage]);

      // Save AI response to database
      if (user) {
        const { error: aiMsgError } = await supabase
          .from('chat_messages')
          .insert({
            user_id: user.id,
            role: 'assistant',
            content: aiResponse,
          });

        if (aiMsgError) {
          console.error('Error saving AI message:', aiMsgError);
        } else {
          // Fire confetti on successful AI response
          fireSideConfetti('right');
        }
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to get AI response',
        variant: 'destructive'
      });

      // Add error message to chat
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        sender: 'ai',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b bg-primary/5">
        <h3 className="font-semibold flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          Officer AI Assistant
        </h3>
        <p className="text-sm text-muted-foreground">Ask questions about policies, procedures, and clients</p>
      </div>

      {isLoadingHistory ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
            <p className="text-sm text-muted-foreground">Loading chat history...</p>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.sender === 'ai' && (
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[70%] rounded-lg p-3 ${
                    message.sender === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </p>
                </div>
                {message.sender === 'user' && (
                  <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                    <User className="h-5 w-5" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-primary animate-pulse" />
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-primary/50 rounded-full animate-bounce delay-100" />
                    <div className="w-2 h-2 bg-primary/50 rounded-full animate-bounce delay-200" />
                  </div>
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>
      )}

      <div className="p-4 border-t bg-background">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your question..."
            disabled={isLoading}
            className="flex-1"
          />
          <RippleButton
            onClick={handleSendMessage}
            disabled={!input.trim() || isLoading}
            size="icon"
            rippleColor="rgba(16, 185, 129, 0.5)"
          >
            <Send className="h-4 w-4" />
          </RippleButton>
        </div>
      </div>
    </div>
  );
};

export default OfficerChat;
