import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe, Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

import { normalizeLanguages, type NormalizedLanguage } from '@/lib/supabaseNormalizers';

type Language = Pick<NormalizedLanguage, 'id' | 'code' | 'name' | 'native_name' | 'display_order'>;

interface LanguageSelectorProps {
  onSelect: (language: Language) => void;
  selectedCode?: string;
}

const FLAG_MAP: Record<string, string> = {
  en: '🇬🇧',
  tw: '🇬🇭',
  ga: '🇬🇭',
  ee: '🇬🇭',
  ha: '🇳🇬',
};

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ onSelect, selectedCode }) => {
  const { data: languages, isLoading } = useQuery({
    queryKey: ['supported-languages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supported_languages')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      if (error) throw error;
      return normalizeLanguages(data).map(({ id, code, name, native_name, display_order }) => ({
        id, code, name, native_name, display_order,
      }));
    },
  });

  if (isLoading) {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader className="text-center">
          <Skeleton className="h-8 w-48 mx-auto" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto border-2 border-primary/20">
      <CardHeader className="text-center pb-4">
        <div className="flex justify-center mb-3">
          <div className="p-3 rounded-full bg-primary/10">
            <Globe className="h-8 w-8 text-primary" />
          </div>
        </div>
        <CardTitle className="text-xl">Select Your Language</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Choose a language for this call
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {languages?.map((lang) => (
          <Button
            key={lang.id}
            variant={selectedCode === lang.code ? 'default' : 'outline'}
            className="w-full h-14 justify-between text-base font-medium"
            onClick={() => onSelect(lang)}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{FLAG_MAP[lang.code] || '🌐'}</span>
              <div className="text-left">
                <div>{lang.name}</div>
                {lang.native_name !== lang.name && (
                  <div className="text-xs opacity-70">{lang.native_name}</div>
                )}
              </div>
            </div>
            {selectedCode === lang.code && <Check className="h-5 w-5" />}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
};

export default LanguageSelector;
