import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Globe,
  Timer,
} from 'lucide-react';
import { useWebRTCCall, CallStatus } from '@/hooks/useWebRTCCall';
import LanguageSelector from '@/components/call/LanguageSelector';
import { useToast } from '@/components/ui/use-toast';
import { speakGreeting } from '@/utils/ttsGreetings';

interface SelectedLanguage {
  id: string;
  code: string;
  name: string;
  native_name: string;
  display_order: number;
}

const STATUS_CONFIG: Record<CallStatus, { label: string; color: string }> = {
  idle: { label: 'Ready', color: 'bg-muted text-muted-foreground' },
  calling: { label: 'Calling...', color: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400' },
  ringing: { label: 'Ringing...', color: 'bg-blue-500/20 text-blue-700 dark:text-blue-400' },
  connected: { label: 'Connected', color: 'bg-green-500/20 text-green-700 dark:text-green-400' },
  ended: { label: 'Call Ended', color: 'bg-red-500/20 text-red-700 dark:text-red-400' },
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const WebRTCCallPanel: React.FC = () => {
  const { toast } = useToast();
  const [selectedLanguage, setSelectedLanguage] = useState<SelectedLanguage | null>(null);
  const [showLanguageSelect, setShowLanguageSelect] = useState(true);

  const {
    callStatus,
    isMuted,
    callDuration,
    startCall,
    hangup,
    toggleMute,
  } = useWebRTCCall({
    onStatusChange: (status) => {
      if (status === 'connected') {
        toast({ title: 'Call Connected', description: `Language: ${selectedLanguage?.name || 'English'}` });
        speakGreeting(selectedLanguage?.code || 'en');
      } else if (status === 'ended') {
        toast({ title: 'Call Ended', description: `Duration: ${formatTime(callDuration)}` });
      }
    },
    onError: (error) => {
      toast({ title: 'Call Error', description: error, variant: 'destructive' });
    },
  });

  const handleLanguageSelect = (lang: SelectedLanguage) => {
    setSelectedLanguage(lang);
  };

  const handleProceed = () => {
    if (selectedLanguage) {
      setShowLanguageSelect(false);
    }
  };

  const handleStartCall = async () => {
    // In a real scenario, you'd have a call_id from selecting a client
    // For demo, we create a placeholder
    const callId = crypto.randomUUID();
    await startCall(callId, selectedLanguage?.code || 'en');
  };

  const handleBackToLanguage = () => {
    if (callStatus === 'idle' || callStatus === 'ended') {
      setShowLanguageSelect(true);
    }
  };

  const statusConfig = STATUS_CONFIG[callStatus];

  // Show language selector first
  if (showLanguageSelect) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-6 py-12">
          <div className="max-w-md mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Voice Call
              </h1>
              <p className="text-muted-foreground">
                Select a language before starting your call
              </p>
            </div>

            <LanguageSelector
              onSelect={handleLanguageSelect}
              selectedCode={selectedLanguage?.code}
            />

            {selectedLanguage && (
              <div className="flex justify-center">
                <Button
                  size="lg"
                  onClick={handleProceed}
                  className="px-8 gap-2"
                >
                  <Phone className="h-5 w-5" />
                  Proceed to Call
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show call panel
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-lg mx-auto space-y-6">
          <Card className="border-2 border-primary/20">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Voice Call</CardTitle>
              <div className="flex items-center justify-center gap-2 mt-2">
                <Badge className={statusConfig.color}>
                  {callStatus === 'connected' && (
                    <span className="relative flex h-2 w-2 mr-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                  )}
                  {statusConfig.label}
                </Badge>
                <Badge variant="outline" className="gap-1 cursor-pointer" onClick={handleBackToLanguage}>
                  <Globe className="h-3 w-3" />
                  {selectedLanguage?.name || 'English'}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-8">
              {/* Duration display */}
              {(callStatus === 'connected' || callStatus === 'ended') && (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 text-4xl font-mono font-bold text-foreground">
                    <Timer className="h-8 w-8 text-muted-foreground" />
                    {formatTime(callDuration)}
                  </div>
                </div>
              )}

              {/* Calling animation */}
              {(callStatus === 'calling' || callStatus === 'ringing') && (
                <div className="flex justify-center">
                  <div className="relative">
                    <div className="h-24 w-24 rounded-full bg-primary/20 flex items-center justify-center">
                      <Phone className="h-10 w-10 text-primary animate-pulse" />
                    </div>
                    <div className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping" />
                  </div>
                </div>
              )}

              {/* Call controls */}
              <div className="flex items-center justify-center gap-4">
                {callStatus === 'idle' && (
                  <Button
                    size="lg"
                    onClick={handleStartCall}
                    className="h-16 w-16 rounded-full bg-green-600 hover:bg-green-700"
                  >
                    <Phone className="h-7 w-7" />
                  </Button>
                )}

                {callStatus === 'connected' && (
                  <>
                    <Button
                      size="lg"
                      variant={isMuted ? 'destructive' : 'outline'}
                      onClick={toggleMute}
                      className="h-14 w-14 rounded-full"
                    >
                      {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                    </Button>

                    <Button
                      size="lg"
                      onClick={hangup}
                      className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-700"
                    >
                      <PhoneOff className="h-7 w-7" />
                    </Button>
                  </>
                )}

                {(callStatus === 'calling' || callStatus === 'ringing') && (
                  <Button
                    size="lg"
                    onClick={hangup}
                    className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-700"
                  >
                    <PhoneOff className="h-7 w-7" />
                  </Button>
                )}

                {callStatus === 'ended' && (
                  <Button
                    size="lg"
                    onClick={handleStartCall}
                    className="h-16 w-16 rounded-full bg-green-600 hover:bg-green-700"
                  >
                    <Phone className="h-7 w-7" />
                  </Button>
                )}
              </div>

              {/* Mute label */}
              {callStatus === 'connected' && (
                <p className="text-center text-sm text-muted-foreground">
                  {isMuted ? 'Microphone muted' : 'Microphone active'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default WebRTCCallPanel;
