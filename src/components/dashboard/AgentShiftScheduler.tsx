import { useState, useEffect } from "react";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { 
  CalendarDays, 
  Plus, 
  Clock, 
  User, 
  Coffee,
  CheckCircle,
  Edit,
  Trash2,
  CalendarIcon
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";

interface AgentShift {
  id: string;
  agent_email: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  break_start: string | null;
  break_end: string | null;
  status: string;
  notes: string | null;
}

interface AgentStatus {
  agent_email: string;
  status: string;
}

export const AgentShiftScheduler = () => {
  const [shifts, setShifts] = useState<AgentShift[]>([]);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"day" | "week">("week");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<AgentShift | null>(null);
  const [newShift, setNewShift] = useState({
    agent_email: "",
    shift_date: format(new Date(), "yyyy-MM-dd"),
    start_time: "09:00",
    end_time: "17:00",
    break_start: "12:00",
    break_end: "13:00",
    notes: ""
  });
  const { toast } = useToast();

  const fetchShifts = async () => {
    const startDate = viewMode === "week" 
      ? format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy-MM-dd")
      : format(selectedDate, "yyyy-MM-dd");
    const endDate = viewMode === "week"
      ? format(addDays(startOfWeek(selectedDate, { weekStartsOn: 1 }), 6), "yyyy-MM-dd")
      : format(selectedDate, "yyyy-MM-dd");

    const { data, error } = await supabase
      .from("agent_shifts")
      .select("*")
      .gte("shift_date", startDate)
      .lte("shift_date", endDate)
      .order("shift_date")
      .order("start_time");

    if (error) {
      console.error("Error fetching shifts:", error);
      return;
    }
    setShifts(data || []);
  };

  const fetchAgents = async () => {
    const { data, error } = await supabase
      .from("agent_status")
      .select("agent_email, status")
      .order("agent_email");

    if (error) {
      console.error("Error fetching agents:", error);
      return;
    }
    setAgents(data || []);
  };

  useEffect(() => {
    fetchShifts();
    fetchAgents();
  }, [selectedDate, viewMode]);

  useRealtimeRefresh(["agent_shifts"], () => fetchShifts());
  useRealtimeRefresh(["agent_status"], () => fetchAgents());

  const handleCreateShift = async () => {
    if (!newShift.agent_email || !newShift.shift_date) {
      toast({
        title: "Missing Information",
        description: "Please select an agent and date",
        variant: "destructive"
      });
      return;
    }

    try {
      if (editingShift) {
        await supabase
          .from("agent_shifts")
          .update({
            agent_email: newShift.agent_email,
            shift_date: newShift.shift_date,
            start_time: newShift.start_time,
            end_time: newShift.end_time,
            break_start: newShift.break_start || null,
            break_end: newShift.break_end || null,
            notes: newShift.notes || null
          })
          .eq("id", editingShift.id);

        toast({ title: "Shift Updated", description: "Shift has been updated successfully" });
      } else {
        await supabase
          .from("agent_shifts")
          .insert({
            agent_email: newShift.agent_email,
            shift_date: newShift.shift_date,
            start_time: newShift.start_time,
            end_time: newShift.end_time,
            break_start: newShift.break_start || null,
            break_end: newShift.break_end || null,
            notes: newShift.notes || null
          });

        toast({ title: "Shift Created", description: "New shift has been scheduled" });
      }

      setDialogOpen(false);
      setEditingShift(null);
      resetForm();
      fetchShifts();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save shift",
        variant: "destructive"
      });
    }
  };

  const handleDeleteShift = async (shiftId: string) => {
    try {
      await supabase.from("agent_shifts").delete().eq("id", shiftId);
      toast({ title: "Shift Deleted", description: "Shift has been removed" });
      fetchShifts();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete shift",
        variant: "destructive"
      });
    }
  };

  const handleEditShift = (shift: AgentShift) => {
    setEditingShift(shift);
    setNewShift({
      agent_email: shift.agent_email,
      shift_date: shift.shift_date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      break_start: shift.break_start || "",
      break_end: shift.break_end || "",
      notes: shift.notes || ""
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setNewShift({
      agent_email: "",
      shift_date: format(new Date(), "yyyy-MM-dd"),
      start_time: "09:00",
      end_time: "17:00",
      break_start: "12:00",
      break_end: "13:00",
      notes: ""
    });
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
      scheduled: { variant: "outline", className: "text-blue-600 border-blue-300" },
      in_progress: { variant: "default", className: "bg-green-500" },
      completed: { variant: "secondary", className: "" },
      cancelled: { variant: "destructive", className: "" }
    };
    const style = styles[status] || styles.scheduled;
    return (
      <Badge variant={style.variant} className={style.className}>
        {status.replace("_", " ")}
      </Badge>
    );
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => 
    addDays(startOfWeek(selectedDate, { weekStartsOn: 1 }), i)
  );

  const getShiftsForDay = (date: Date) => {
    return shifts.filter(shift => isSameDay(new Date(shift.shift_date), date));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            Agent Shift Scheduler
          </h2>
          <p className="text-muted-foreground">
            Manage work schedules, breaks, and availability
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={viewMode} onValueChange={(v) => setViewMode(v as "day" | "week")}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day View</SelectItem>
              <SelectItem value="week">Week View</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                {format(selectedDate, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setEditingShift(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add Shift
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingShift ? "Edit Shift" : "Schedule New Shift"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Agent</Label>
                  <Select
                    value={newShift.agent_email}
                    onValueChange={value => setNewShift(prev => ({ ...prev, agent_email: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map(agent => (
                        <SelectItem key={agent.agent_email} value={agent.agent_email}>
                          {agent.agent_email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={newShift.shift_date}
                    onChange={e => setNewShift(prev => ({ ...prev, shift_date: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <Input
                      type="time"
                      value={newShift.start_time}
                      onChange={e => setNewShift(prev => ({ ...prev, start_time: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time</Label>
                    <Input
                      type="time"
                      value={newShift.end_time}
                      onChange={e => setNewShift(prev => ({ ...prev, end_time: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <Coffee className="h-3 w-3" />
                      Break Start
                    </Label>
                    <Input
                      type="time"
                      value={newShift.break_start}
                      onChange={e => setNewShift(prev => ({ ...prev, break_start: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Break End</Label>
                    <Input
                      type="time"
                      value={newShift.break_end}
                      onChange={e => setNewShift(prev => ({ ...prev, break_end: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={newShift.notes}
                    onChange={e => setNewShift(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Optional notes about this shift..."
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateShift}>
                    {editingShift ? "Update Shift" : "Create Shift"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{agents.length}</p>
                <p className="text-sm text-muted-foreground">Total Agents</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <CalendarDays className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{shifts.length}</p>
                <p className="text-sm text-muted-foreground">Scheduled Shifts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-green-500/10">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {agents.filter(a => a.status === "available").length}
                </p>
                <p className="text-sm text-muted-foreground">Available Now</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-yellow-500/10">
                <Coffee className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {agents.filter(a => a.status === "on_break").length}
                </p>
                <p className="text-sm text-muted-foreground">On Break</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Week View */}
      {viewMode === "week" && (
        <Card>
          <CardHeader>
            <CardTitle>Week Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map(day => (
                <div key={day.toISOString()} className="space-y-2">
                  <div className={cn(
                    "text-center p-2 rounded-lg font-medium",
                    isSameDay(day, new Date()) ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}>
                    <p className="text-xs">{format(day, "EEE")}</p>
                    <p className="text-lg">{format(day, "d")}</p>
                  </div>
                  <div className="space-y-1 min-h-[100px]">
                    {getShiftsForDay(day).map(shift => (
                      <div
                        key={shift.id}
                        className="p-2 bg-primary/10 rounded text-xs cursor-pointer hover:bg-primary/20 transition-colors"
                        onClick={() => handleEditShift(shift)}
                      >
                        <p className="font-medium truncate">{shift.agent_email.split("@")[0]}</p>
                        <p className="text-muted-foreground">
                          {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Day View / List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {viewMode === "day" ? `Shifts for ${format(selectedDate, "MMMM d, yyyy")}` : "All Shifts This Week"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Shift Hours</TableHead>
                <TableHead>Break</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No shifts scheduled for this period
                  </TableCell>
                </TableRow>
              ) : (
                shifts.map(shift => (
                  <TableRow key={shift.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{shift.agent_email}</span>
                      </div>
                    </TableCell>
                    <TableCell>{format(new Date(shift.shift_date), "MMM d, yyyy")}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {shift.break_start && shift.break_end ? (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Coffee className="h-3 w-3" />
                          {shift.break_start.slice(0, 5)} - {shift.break_end.slice(0, 5)}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(shift.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleEditShift(shift)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => handleDeleteShift(shift.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
