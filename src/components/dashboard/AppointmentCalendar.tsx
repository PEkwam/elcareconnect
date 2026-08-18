import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format, isSameDay, parseISO } from "date-fns";
import { CalendarDays, MapPin, User } from "lucide-react";

interface Appointment {
  id: string;
  scheduled_date: string;
  appointment_type: string;
  status: string | null;
  medical_center: string | null;
  clients: { name: string } | null;
}

const AppointmentCalendar = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("medical_appointments")
        .select("id, scheduled_date, appointment_type, status, medical_center, clients(name)")
        .order("scheduled_date", { ascending: true });
      if (data) setAppointments(data as unknown as Appointment[]);
    };
    fetch();
  }, []);

  const dayHasAppointment = (day: Date) =>
    appointments.some((a) => a.scheduled_date && isSameDay(parseISO(a.scheduled_date), day));

  const appointmentsForSelected = selectedDate
    ? appointments.filter((a) => a.scheduled_date && isSameDay(parseISO(a.scheduled_date), selectedDate))
    : [];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            modifiers={{ hasAppointment: dayHasAppointment }}
            modifiersClassNames={{ hasAppointment: "bg-primary/15 font-bold text-primary" }}
            className="rounded-md border"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {selectedDate ? format(selectedDate, "PPP") : "Select a date"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {appointmentsForSelected.length === 0 ? (
            <p className="text-sm text-muted-foreground">No appointments on this day.</p>
          ) : (
            appointmentsForSelected.map((apt) => (
              <div key={apt.id} className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium">
                    <User className="h-4 w-4 text-muted-foreground" />
                    {apt.clients?.name || "Unknown client"}
                  </div>
                  <Badge variant="outline">{apt.status || "pending"}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">{apt.appointment_type}</div>
                {apt.medical_center && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {apt.medical_center}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AppointmentCalendar;
