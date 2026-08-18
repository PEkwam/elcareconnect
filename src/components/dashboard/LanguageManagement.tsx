import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Globe, Plus, Pencil, Save, X, Upload, Play, Trash2 } from 'lucide-react';
import { validateAudioFile } from '@/utils/audioValidation';
import { normalizeLanguages, type NormalizedLanguage as Language } from '@/lib/supabaseNormalizers';

const EMPTY: Omit<Language, 'id' | 'created_at'> = {
  code: '',
  name: '',
  native_name: '',
  display_order: 0,
  is_active: true,
  greeting_text: '',
  menu_prompt_text: '',
  greeting_audio_url: null,
  menu_audio_url: null,
  tts_provider: 'browser',
};

const TTS_PROVIDERS = [
  { value: 'browser', label: 'Browser SpeechSynthesis (free, basic)' },
  { value: 'recorded_only', label: 'Pre-recorded MP3 only (no fallback)' },
  { value: 'elevenlabs', label: 'ElevenLabs (best quality, paid)' },
  { value: 'google', label: 'Google Cloud TTS (paid)' },
];

export const LanguageManagement: React.FC = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Language, 'id' | 'created_at'>>(EMPTY);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState<'greeting' | 'menu' | null>(null);
  const greetingFileRef = useRef<HTMLInputElement>(null);
  const menuFileRef = useRef<HTMLInputElement>(null);

  const { data: languages = [], isLoading } = useQuery({
    queryKey: ['supported-languages-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supported_languages')
        .select('*')
        .order('display_order');
      if (error) throw error;
      return normalizeLanguages(data);
    },
  });

  const upsert = useMutation({
    mutationFn: async (lang: Omit<Language, 'id' | 'created_at'> & { id?: string; _keepOpen?: boolean }) => {
      const payload = {
        code: lang.code,
        name: lang.name,
        native_name: lang.native_name,
        display_order: lang.display_order,
        is_active: lang.is_active,
        greeting_text: lang.greeting_text || null,
        menu_prompt_text: lang.menu_prompt_text || null,
        greeting_audio_url: lang.greeting_audio_url,
        menu_audio_url: lang.menu_audio_url,
        tts_provider: lang.tts_provider,
      };
      if (lang.id) {
        const { error } = await supabase.from('supported_languages').update(payload).eq('id', lang.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('supported_languages').insert(payload);
        if (error) throw error;
      }
      return { keepOpen: !!lang._keepOpen, wasEdit: !!lang.id };
    },
    onSuccess: ({ keepOpen, wasEdit }) => {
      qc.invalidateQueries({ queryKey: ['supported-languages-admin'] });
      toast({ title: 'Language saved' });
      if (keepOpen && !wasEdit) {
        // Stay in add mode, clear the form for the next entry
        setEditingId(null);
        setForm({ ...EMPTY, display_order: (languages.length || 0) + 1 });
        setAdding(true);
      } else {
        reset();
      }
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('supported_languages').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supported-languages-admin'] }),
  });

  const reset = () => {
    setEditingId(null);
    setForm(EMPTY);
    setAdding(false);
  };

  const startEdit = (lang: Language) => {
    setAdding(false);
    setEditingId(lang.id);
    setForm({
      code: lang.code,
      name: lang.name,
      native_name: lang.native_name,
      display_order: lang.display_order,
      is_active: lang.is_active,
      greeting_text: lang.greeting_text || '',
      menu_prompt_text: lang.menu_prompt_text || '',
      greeting_audio_url: lang.greeting_audio_url,
      menu_audio_url: lang.menu_audio_url,
      tts_provider: lang.tts_provider || 'browser',
    });
  };

  const handleUpload = async (file: File, kind: 'greeting' | 'menu') => {
    const maxDuration = kind === 'greeting' ? 30 : 60;
    const error = await validateAudioFile(file, { maxSizeMB: 5, maxDurationSec: maxDuration, minDurationSec: 0.5 });
    if (error) {
      toast({ title: 'Invalid audio file', description: error, variant: 'destructive' });
      return;
    }
    setUploading(kind);
    try {
      const ext = file.name.split('.').pop() || 'mp3';
      const path = `${form.code || 'unknown'}/${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('language-audio').upload(path, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type,
      });
      if (error) throw error;
      const { data } = supabase.storage.from('language-audio').getPublicUrl(path);
      setForm((f) => ({
        ...f,
        [kind === 'greeting' ? 'greeting_audio_url' : 'menu_audio_url']: data.publicUrl,
      }));
      toast({ title: 'Audio uploaded' });
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  };

  const previewAudio = (url: string) => {
    const audio = new Audio(url);
    audio.play().catch(() => toast({ title: 'Could not play audio', variant: 'destructive' }));
  };

  const handleSave = (keepOpen = false) => {
    if (!form.code || !form.name || !form.native_name) {
      toast({ title: 'Code, name, and native name are required', variant: 'destructive' });
      return;
    }
    upsert.mutate(editingId ? { ...form, id: editingId } : { ...form, _keepOpen: keepOpen });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Supported Languages & Voice Prompts
        </CardTitle>
        {!adding && !editingId && (
          <Button size="sm" onClick={() => { setAdding(true); setForm({ ...EMPTY, display_order: languages.length }); }}>
            <Plus className="h-4 w-4 mr-1" /> Add Language
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {(adding || editingId) && (
          <div className="space-y-4 p-4 rounded-lg border border-primary/20 bg-muted/30">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <Label>Code</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="tw" />
              </div>
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Twi" />
              </div>
              <div>
                <Label>Native Name</Label>
                <Input value={form.native_name} onChange={(e) => setForm({ ...form, native_name: e.target.value })} placeholder="Akan Twi" />
              </div>
              <div>
                <Label>Order</Label>
                <Input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })} />
              </div>
            </div>

            <div>
              <Label>Fallback TTS Provider</Label>
              <Select value={form.tts_provider} onValueChange={(v) => setForm({ ...form, tts_provider: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TTS_PROVIDERS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Used when no MP3 is uploaded. For Twi/Ga/Ewe, uploading a recording is strongly recommended.
              </p>
            </div>

            <div>
              <Label>Greeting Text</Label>
              <Textarea
                value={form.greeting_text || ''}
                onChange={(e) => setForm({ ...form, greeting_text: e.target.value })}
                placeholder="Akwaaba! Mepa wo kyɛw..."
                rows={2}
              />
              <div className="flex items-center gap-2 mt-2">
                <input
                  ref={greetingFileRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'greeting')}
                />
                <Button size="sm" variant="outline" onClick={() => greetingFileRef.current?.click()} disabled={uploading === 'greeting'}>
                  <Upload className="h-3 w-3 mr-1" /> {form.greeting_audio_url ? 'Replace' : 'Upload'} Greeting MP3
                </Button>
                {form.greeting_audio_url && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => previewAudio(form.greeting_audio_url!)}>
                      <Play className="h-3 w-3 mr-1" /> Preview
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, greeting_audio_url: null })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                    <Badge variant="secondary" className="text-xs">MP3 ready</Badge>
                  </>
                )}
              </div>
            </div>

            <div>
              <Label>IVR Menu Prompt Text</Label>
              <Textarea
                value={form.menu_prompt_text || ''}
                onChange={(e) => setForm({ ...form, menu_prompt_text: e.target.value })}
                placeholder="Mia 1 sɛ wopɛ sɛ wo hyehyɛ appointment..."
                rows={3}
              />
              <div className="flex items-center gap-2 mt-2">
                <input
                  ref={menuFileRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'menu')}
                />
                <Button size="sm" variant="outline" onClick={() => menuFileRef.current?.click()} disabled={uploading === 'menu'}>
                  <Upload className="h-3 w-3 mr-1" /> {form.menu_audio_url ? 'Replace' : 'Upload'} Menu MP3
                </Button>
                {form.menu_audio_url && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => previewAudio(form.menu_audio_url!)}>
                      <Play className="h-3 w-3 mr-1" /> Preview
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, menu_audio_url: null })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                    <Badge variant="secondary" className="text-xs">MP3 ready</Badge>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t">
              <Button size="sm" variant="ghost" onClick={reset}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              {!editingId && (
                <Button size="sm" variant="secondary" onClick={() => handleSave(true)} disabled={upsert.isPending}>
                  <Plus className="h-4 w-4 mr-1" /> Save & add another
                </Button>
              )}
              <Button size="sm" onClick={() => handleSave(false)} disabled={upsert.isPending}>
                <Save className="h-4 w-4 mr-1" /> Save Language
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          <div className="divide-y">
            {languages.map((lang) => (
              <div key={lang.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant={lang.is_active ? 'default' : 'secondary'}>{lang.code}</Badge>
                  <span className="font-medium">{lang.name}</span>
                  <span className="text-muted-foreground text-sm">({lang.native_name})</span>
                  {lang.greeting_audio_url && <Badge variant="outline" className="text-xs">🎙 Greeting</Badge>}
                  {lang.menu_audio_url && <Badge variant="outline" className="text-xs">🎙 Menu</Badge>}
                  {!lang.greeting_audio_url && !lang.menu_audio_url && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">TTS: {lang.tts_provider}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={lang.is_active}
                    onCheckedChange={(checked) => toggleActive.mutate({ id: lang.id, is_active: checked })}
                  />
                  <Button size="icon" variant="ghost" onClick={() => startEdit(lang)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
