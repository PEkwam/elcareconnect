import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Trash2, Save, Phone, Upload, X } from 'lucide-react';

interface Lang { code: string; name: string; native_name: string; }
interface IVROption {
  id: string;
  language_code: string;
  digit: string;
  label: string;
  action: string;
  target: string | null;
  prompt_text: string | null;
  audio_url: string | null;
  display_order: number;
  is_active: boolean;
}

const ACTIONS = [
  { value: 'transfer_agent', label: 'Transfer to Agent' },
  { value: 'transfer_specialist', label: 'Transfer to Specialist' },
  { value: 'play_message', label: 'Play Message' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'callback', label: 'Schedule Callback' },
  { value: 'language_change', label: 'Change Language' },
  { value: 'hangup', label: 'Hang Up' },
];

const blank = (lang: string): Omit<IVROption, 'id'> => ({
  language_code: lang,
  digit: '1',
  label: '',
  action: 'transfer_agent',
  target: '',
  prompt_text: '',
  audio_url: null,
  display_order: 0,
  is_active: true,
});

export const IVRMenuManager: React.FC = () => {
  const { toast } = useToast();
  const [languages, setLanguages] = useState<Lang[]>([]);
  const [selectedLang, setSelectedLang] = useState<string>('');
  const [options, setOptions] = useState<IVROption[]>([]);
  const [editing, setEditing] = useState<(Omit<IVROption, 'id'> & { id?: string }) | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadLangs = async () => {
    const { data } = await supabase.from('supported_languages').select('code,name,native_name').eq('is_active', true).order('display_order');
    if (data) {
      setLanguages(data as any);
      if (!selectedLang && data.length) setSelectedLang(data[0].code);
    }
  };

  const loadOptions = async () => {
    if (!selectedLang) return;
    const { data } = await supabase
      .from('ivr_menu_options' as any)
      .select('*')
      .eq('language_code', selectedLang)
      .order('digit');
    if (data) setOptions(data as any);
  };

  useEffect(() => { loadLangs(); }, []);
  useEffect(() => { loadOptions(); }, [selectedLang]);

  const save = async () => {
    if (!editing) return;
    if (!editing.label.trim() || !editing.digit.trim()) {
      toast({ title: 'Digit and label required', variant: 'destructive' });
      return;
    }
    const payload = { ...editing, target: editing.target || null, prompt_text: editing.prompt_text || null };
    const { error } = editing.id
      ? await supabase.from('ivr_menu_options' as any).update(payload).eq('id', editing.id)
      : await supabase.from('ivr_menu_options' as any).insert(payload);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved' });
      setEditing(null);
      loadOptions();
    }
  };

  const remove = async (id: string) => {
    await supabase.from('ivr_menu_options' as any).delete().eq('id', id);
    toast({ title: 'Removed' });
    loadOptions();
  };

  const toggleActive = async (opt: IVROption) => {
    await supabase.from('ivr_menu_options' as any).update({ is_active: !opt.is_active }).eq('id', opt.id);
    loadOptions();
  };

  const uploadAudio = async (file: File) => {
    if (!editing) return;
    if (file.size === 0) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'mp3';
      const path = `ivr/${editing.language_code}/digit-${editing.digit}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('language-audio').upload(path, file, { upsert: true, contentType: file.type || 'audio/mpeg' });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('language-audio').getPublicUrl(path);
      setEditing({ ...editing, audio_url: publicUrl });
      toast({ title: 'Audio uploaded' });
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="border-2 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-primary" />
          IVR Menu Options
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label>Language</Label>
            <Select value={selectedLang} onValueChange={setSelectedLang}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {languages.map(l => <SelectItem key={l.code} value={l.code}>{l.name} ({l.native_name})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setEditing(blank(selectedLang))} className="gradient-primary">
            <Plus className="h-4 w-4 mr-1" /> Add Option
          </Button>
        </div>

        <div className="space-y-2">
          {options.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No menu options yet. Click "Add Option" to create one.</p>}
          {options.map(opt => (
            <div key={opt.id} className="flex items-center gap-3 p-3 border rounded-lg bg-card hover:shadow-md transition">
              <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold">{opt.digit}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{opt.label}</div>
                <div className="text-xs text-muted-foreground">
                  {ACTIONS.find(a => a.value === opt.action)?.label}{opt.target ? ` → ${opt.target}` : ''}
                </div>
                {opt.audio_url && <audio controls src={opt.audio_url} className="h-7 mt-1 w-full max-w-xs" />}
              </div>
              <Switch checked={opt.is_active} onCheckedChange={() => toggleActive(opt)} />
              <Button size="sm" variant="ghost" onClick={() => setEditing(opt)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(opt.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>

        {editing && (
          <Card className="border-2 border-primary/40 bg-gradient-to-br from-card to-primary/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{editing.id ? 'Edit' : 'New'} Menu Option</h3>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label>Digit (0-9, *, #)</Label>
                  <Input maxLength={1} value={editing.digit} onChange={e => setEditing({ ...editing, digit: e.target.value })} />
                </div>
                <div>
                  <Label>Label</Label>
                  <Input value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })} placeholder="e.g. Speak to an agent" />
                </div>
                <div>
                  <Label>Action</Label>
                  <Select value={editing.action} onValueChange={v => setEditing({ ...editing, action: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Target (optional)</Label>
                  <Input value={editing.target || ''} onChange={e => setEditing({ ...editing, target: e.target.value })} placeholder="agent email, queue, lang code" />
                </div>
              </div>
              <div>
                <Label>Prompt Text (TTS fallback)</Label>
                <Textarea rows={2} value={editing.prompt_text || ''} onChange={e => setEditing({ ...editing, prompt_text: e.target.value })} />
              </div>
              <div>
                <Label>Audio Prompt (optional)</Label>
                <input ref={fileRef} type="file" accept="audio/*" className="hidden"
                  onChange={e => e.target.files?.[0] && uploadAudio(e.target.files[0])} />
                <div className="flex gap-2 mt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <Upload className="h-4 w-4 mr-1" /> {uploading ? 'Uploading...' : editing.audio_url ? 'Replace' : 'Upload'}
                  </Button>
                  {editing.audio_url && (
                    <>
                      <audio controls src={editing.audio_url} className="h-8 flex-1" />
                      <Button size="sm" variant="ghost" onClick={() => setEditing({ ...editing, audio_url: null })}><Trash2 className="h-4 w-4" /></Button>
                    </>
                  )}
                </div>
              </div>
              <Button onClick={save} className="w-full gradient-primary">
                <Save className="h-4 w-4 mr-2" /> Save Option
              </Button>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
};

export default IVRMenuManager;
