import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AppointmentCalendar from "./AppointmentCalendar";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";

interface Appointment {
  id: string;
  client_id: string;
  scheduled_date: string;
  appointment_type: string;
  status: string;
  medical_center: string;
  notes: string;
  created_at: string;
  clients: {
    name: string;
    email: string;
    phone: string;
  };
}

const AppointmentsTab = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchAppointments();
  }, []);

  useRealtimeRefresh(["medical_appointments"], () => fetchAppointments());

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("medical_appointments")
        .select(`
          *,
          clients (
            name,
            email,
            phone
          )
        `)
        .order("scheduled_date", { ascending: true });

      if (error) throw error;

      setAppointments(data || []);
    } catch (error: any) {
      console.error("Error fetching appointments:", error);
      toast({
        title: "Error",
        description: "Failed to fetch appointments",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      scheduled: "default",
      pending: "secondary",
      completed: "outline",
      cancelled: "destructive",
    };

    return (
      <Badge variant={variants[status] || "secondary"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">Loading appointments...</p>
        </CardContent>
      </Card>
    );
  }

  if (appointments.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">No appointments found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="calendar" className="space-y-4">
      <TabsList>
        <TabsTrigger value="calendar">Calendar View</TabsTrigger>
        <TabsTrigger value="list">List View</TabsTrigger>
      </TabsList>

      <TabsContent value="calendar">
        <AppointmentCalendar />
      </TabsContent>

      <TabsContent value="list">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              All Appointments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {appointments.map((appointment) => (
              <div
                key={appointment.id}
                className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{appointment.clients.name}</span>
                      {getStatusBadge(appointment.status)}
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {appointment.scheduled_date
                          ? format(new Date(appointment.scheduled_date), "MMMM d, yyyy")
                          : "Not scheduled"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>{appointment.medical_center || "Center not specified"}</span>
                    </div>

                    <div className="text-sm">
                      <span className="font-medium">Type:</span> {appointment.appointment_type}
                    </div>

                    {appointment.notes && (
                      <div className="text-sm text-muted-foreground mt-2 p-2 bg-muted/50 rounded">
                        <span className="font-medium">Notes:</span> {appointment.notes}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span>📞 {appointment.clients.phone}</span>
                    </div>
                    {appointment.clients.email && (
                      <div className="flex items-center gap-2">
                        <span>✉️ {appointment.clients.email}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};

export default AppointmentsTab;
