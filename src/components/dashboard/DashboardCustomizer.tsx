import { useState, useEffect } from 'react';
import { motion, Reorder } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Settings2, 
  GripVertical, 
  BarChart3, 
  Users, 
  Phone, 
  Calendar,
  TrendingUp,
  X
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

export interface DashboardWidget {
  id: string;
  name: string;
  icon: React.ElementType;
  enabled: boolean;
}

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'stats', name: 'Stats Cards', icon: BarChart3, enabled: true },
  { id: 'analytics', name: 'Real-time Analytics', icon: TrendingUp, enabled: true },
  { id: 'sentiment', name: 'Sentiment Trends', icon: BarChart3, enabled: true },
  { id: 'queue', name: 'Call Queue', icon: Phone, enabled: true },
  { id: 'clients', name: 'Client Overview', icon: Users, enabled: true },
  { id: 'appointments', name: 'Appointments', icon: Calendar, enabled: true },
];

const STORAGE_KEY = 'dck_dashboard_widgets';

export const useDashboardWidgets = () => {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge with defaults to handle new widgets
        return DEFAULT_WIDGETS.map(defaultWidget => {
          const savedWidget = parsed.find((w: DashboardWidget) => w.id === defaultWidget.id);
          return savedWidget ? { ...defaultWidget, enabled: savedWidget.enabled } : defaultWidget;
        });
      } catch {
        return DEFAULT_WIDGETS;
      }
    }
    return DEFAULT_WIDGETS;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets]);

  const toggleWidget = (id: string) => {
    setWidgets(prev => prev.map(w => 
      w.id === id ? { ...w, enabled: !w.enabled } : w
    ));
  };

  const reorderWidgets = (newOrder: DashboardWidget[]) => {
    setWidgets(newOrder);
  };

  const resetToDefault = () => {
    setWidgets(DEFAULT_WIDGETS);
  };

  const isWidgetEnabled = (id: string) => {
    return widgets.find(w => w.id === id)?.enabled ?? true;
  };

  return {
    widgets,
    toggleWidget,
    reorderWidgets,
    resetToDefault,
    isWidgetEnabled,
  };
};

interface DashboardCustomizerProps {
  widgets: DashboardWidget[];
  onToggle: (id: string) => void;
  onReorder: (widgets: DashboardWidget[]) => void;
  onReset: () => void;
}

export const DashboardCustomizer = ({ 
  widgets, 
  onToggle, 
  onReorder,
  onReset 
}: DashboardCustomizerProps) => {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Customize
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[350px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Customize Dashboard
          </SheetTitle>
        </SheetHeader>
        
        <div className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Drag to reorder widgets or toggle their visibility.
          </p>

          <Reorder.Group 
            axis="y" 
            values={widgets} 
            onReorder={onReorder}
            className="space-y-2"
          >
            {widgets.map((widget) => (
              <Reorder.Item
                key={widget.id}
                value={widget}
                className="cursor-grab active:cursor-grabbing"
              >
                <Card className={`transition-all ${!widget.enabled ? 'opacity-50' : ''}`}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <widget.icon className="h-4 w-4 text-primary" />
                    <span className="flex-1 text-sm font-medium">{widget.name}</span>
                    <Switch
                      checked={widget.enabled}
                      onCheckedChange={() => onToggle(widget.id)}
                    />
                  </CardContent>
                </Card>
              </Reorder.Item>
            ))}
          </Reorder.Group>

          <Button 
            variant="outline" 
            size="sm" 
            className="w-full mt-4"
            onClick={onReset}
          >
            Reset to Default
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
