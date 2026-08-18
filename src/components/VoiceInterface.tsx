import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Mic, 
  MicOff, 
  Phone, 
  PhoneOff, 
  Send, 
  MessageSquare,
  Volume2,
  VolumeX 
} from 'lucide-react';
import { useRealtimeChat } from '@/hooks/useRealtimeChat';
import { useToast } from '@/components/ui/use-toast';

const VoiceInterface: React.FC = () => {
  const { toast } = useToast();
  const [textInput, setTextInput] = useState('');
  
  const {
    messages,
    isConnected,
    isRecording,
    isSpeaking,
    currentTranscript,
    connect,
    disconnect,
    startRecording,
    stopRecording,
    sendTextMessage
  } = useRealtimeChat({
    onConnectionChange: (connected) => {
      if (connected) {
        toast({
          title: "Connected",
          description: "Voice interface is ready",
        });
      } else {
        toast({
          title: "Disconnected",
          description: "Voice interface disconnected",
        });
      }
    },
    onSpeakingChange: (speaking) => {
      console.log('AI speaking:', speaking);
    }
  });

  const handleConnect = async () => {
    try {
      await connect();
    } catch (error) {
      toast({
        title: "Connection Error",
        description: "Failed to connect to voice interface",
        variant: "destructive",
      });
    }
  };

  const handleStartRecording = async () => {
    try {
      await startRecording();
    } catch (error) {
      toast({
        title: "Recording Error",
        description: "Failed to start recording. Please check microphone permissions.",
        variant: "destructive",
      });
    }
  };

  const handleSendText = () => {
    if (textInput.trim()) {
      sendTextMessage(textInput.trim());
      setTextInput('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          AI Voice Interface
        </h1>
        <p className="text-muted-foreground">
          Real-time voice conversation with AI assistant
        </p>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Connection Status</span>
            <div className="flex items-center gap-2">
              {isConnected && (
                <>
                  <Badge variant={isRecording ? "default" : "secondary"}>
                    {isRecording ? "Recording" : "Connected"}
                  </Badge>
                  {isSpeaking && (
                    <Badge variant="secondary" className="animate-pulse">
                      <Volume2 className="h-3 w-3 mr-1" />
                      AI Speaking
                    </Badge>
                  )}
                </>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Controls */}
          <div className="flex gap-2 justify-center">
            {!isConnected ? (
              <Button onClick={handleConnect} className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Connect
              </Button>
            ) : (
              <>
                <Button onClick={disconnect} variant="outline" className="flex items-center gap-2">
                  <PhoneOff className="h-4 w-4" />
                  Disconnect
                </Button>
                
                {!isRecording ? (
                  <Button 
                    onClick={handleStartRecording} 
                    variant="default"
                    className="flex items-center gap-2"
                    disabled={isSpeaking}
                  >
                    <Mic className="h-4 w-4" />
                    Start Recording
                  </Button>
                ) : (
                  <Button 
                    onClick={stopRecording} 
                    variant="destructive"
                    className="flex items-center gap-2"
                  >
                    <MicOff className="h-4 w-4" />
                    Stop Recording
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Current Transcript */}
          {currentTranscript && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-sm font-medium mb-1">AI is speaking:</div>
              <div className="text-sm">{currentTranscript}</div>
            </div>
          )}

          {/* Text Input */}
          {isConnected && (
            <div className="flex gap-2">
              <Input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message or use voice..."
                className="flex-1"
                disabled={isSpeaking}
              />
              <Button 
                onClick={handleSendText} 
                disabled={!textInput.trim() || isSpeaking}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chat Messages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Conversation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96 w-full">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {isConnected ? 'Start a conversation!' : 'Connect to begin chatting'}
              </div>
            ) : (
              <div className="space-y-4 pr-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] p-3 rounded-lg ${
                        message.type === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <div className="text-sm font-medium mb-1">
                        {message.type === 'user' ? 'You' : 'AI Assistant'}
                      </div>
                      <div className="text-sm">{message.content}</div>
                      <div className="text-xs opacity-70 mt-1">
                        {message.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
};

export default VoiceInterface;