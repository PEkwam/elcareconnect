import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Upload, Play, Trash2, Save, Globe } from 'lucide-react';

interface Lang {
  id: string;
  code: string;
  name: string;
  native_name: string;
  greeting_text: string | null;
  menu_prompt_text: string | null;
  greeting_audio_url: string | null;
  menu_audio_url: string | null;
}

export const LanguageAudioUploader: React.FC = () => {
  const { toast } = useToast();
  const [languages, setLanguages] = useState<Lang[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [lang, setLang] = useState<Lang | null>(null);
  const [greetingText, setGreetingText] = useState('');
  const [menuText, setMenuText] = useState('');
  const [uploading, setUploading] = useState<'greeting' | 'menu' | null>(null);
  const greetingRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await supabase.from('supported_languages').select('*').order('display_order');
    if (data) {
      setLanguages(data as any);
      if (!selectedCode && data.length) setSelectedCode(data[0].code);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const l = languages.find(x => x.code === selectedCode) || null;
    setLang(l);
    setGreetingText(l?.greeting_text || '');
    setMenuText(l?.menu_prompt_text || '');
  }, [selectedCode, languages]);

  const upload = async (kind: 'greeting' | 'menu', file: File) => {
    if (!lang) return;
    if (file.size === 0) {
      toast({ title: 'Empty file', variant: 'destructive' });
      return;
    }
    setUploading(kind);
    try {
      const ext = file.name.split('.').pop() || 'mp3';
      const path = `${lang.code}/${kind}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('language-audio')
        .upload(path, file, { upsert: true, contentType: file.type || 'audio/mpeg' });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('language-audio').getPublicUrl(path);
      const field = kind === 'greeting' ? 'greeting_audio_url' : 'menu_audio_url';
      const { error: updErr } = await supabase
        .from('supported_languages')
        .update({ [field]: publicUrl })
        .eq('id', lang.id);
      if (updErr) throw updErr;
      toast({ title: `${kind === 'greeting' ? 'Greeting' : 'Menu'} audio uploaded` });
      load();
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  };

  const removeAudio = async (kind: 'greeting' | 'menu') => {
    if (!lang) return;
    const field = kind === 'greeting' ? 'greeting_audio_url' : 'menu_audio_url';
    await supabase.from('supported_languages').update({ [field]: null }).eq('id', lang.id);
    toast({ title: 'Removed' });
    load();
  };

  const saveTexts = async () => {
    if (!lang) return;
    const { error } = await supabase
      .from('supported_languages')
      .update({ greeting_text: greetingText, menu_prompt_text: menuText })
      .eq('id', lang.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Saved' }); load(); }
  };

  return (
    <Card className="border-2 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          Language Audio Uploads
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label>Select Language</Label>
          <Select value={selectedCode} onValueChange={setSelectedCode}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Choose a language" />
            </SelectTrigger>
            <SelectContent>
              {languages.map(l => (
                <SelectItem key={l.code} value={l.code}>
                  {l.name} ({l.native_name})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {lang && (
          <>
            <div className="grid md:grid-cols-2 gap-4">
              {(['greeting', 'menu'] as const).map(kind => {
                const url = kind === 'greeting' ? lang.greeting_audio_url : lang.menu_audio_url;
                const ref = kind === 'greeting' ? greetingRef : menuRef;
                return (
                  <Card key={kind} className="border bg-gradient-to-br from-card to-muted/30">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold capitalize">{kind} Audio</h3>
                        {url ? <Badge variant="default">Uploaded</Badge> : <Badge variant="outline">Empty</Badge>}
                      </div>
                      {url && <audio controls src={url} className="w-full h-10" />}
                      <input
                        ref={ref}
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={e => e.target.files?.[0] && upload(kind, e.target.files[0])}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => ref.current?.click()}
                          disabled={uploading === kind}
                          className="flex-1"
                        >
                          <Upload className="h-4 w-4 mr-1" />
                          {uploading === kind ? 'Uploading...' : url ? 'Replace' : 'Upload'}
                        </Button>
                        {url && (
                          <Button size="sm" variant="ghost" onClick={() => removeAudio(kind)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="space-y-3">
              <div>
                <Label>Greeting Text (TTS fallback)</Label>
                <Textarea value={greetingText} onChange={e => setGreetingText(e.target.value)} rows={2} className="mt-1" />
              </div>
              <div>
                <Label>Menu Prompt Text (TTS fallback)</Label>
                <Textarea value={menuText} onChange={e => setMenuText(e.target.value)} rows={2} className="mt-1" />
              </div>
              <Button onClick={saveTexts} className="gradient-primary">
                <Save className="h-4 w-4 mr-2" /> Save Texts
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default LanguageAudioUploader;
