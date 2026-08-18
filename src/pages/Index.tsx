import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Phone, Users, Calendar, DollarSign } from "lucide-react";
import { Link } from "react-router-dom";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="container mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent mb-6">
            Care Connect
          </h1>
          <div className="flex justify-center">
            <Button asChild size="lg" className="px-8 py-3 text-lg font-semibold">
              <Link to="/dashboard">
                Get Started Now
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-4">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Premium Reminders</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Automated AI calls to remind clients about outstanding premium payments 
                with intelligent conversation flows.
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-destructive/10 mb-4">
                <Phone className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle>Failed Deduction Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Notify clients about unsuccessful payment deductions and guide them 
                through payment recovery options.
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-accent/10 mb-4">
                <Calendar className="h-6 w-6 text-accent-foreground" />
              </div>
              <CardTitle>Medical Bookings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Intelligent scheduling of pending medical appointments with approved 
                centers and automated follow-ups.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Call Center Operations Section */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-12 text-white border border-slate-700 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10"></div>
          <div className="relative z-10">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold mb-4">Professional Call Center Operations</h2>
              <p className="text-xl text-slate-300 max-w-3xl mx-auto">
                Advanced AI-powered solutions for modern call center management and client engagement
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:bg-white/10 transition-all duration-300">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-green-600 mb-4 mx-auto">
                  <Phone className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-center">Smart Dialing</h3>
                <p className="text-slate-300 text-center">Intelligent call routing and automated dialing with optimal timing algorithms</p>
              </div>

              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:bg-white/10 transition-all duration-300">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 mb-4 mx-auto">
                  <Users className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-center">Agent Dashboard</h3>
                <p className="text-slate-300 text-center">Real-time monitoring and performance analytics for call center agents</p>
              </div>

              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:bg-white/10 transition-all duration-300">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 mb-4 mx-auto">
                  <Calendar className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-center">Campaign Scheduler</h3>
                <p className="text-slate-300 text-center">Automated campaign management with intelligent scheduling and follow-ups</p>
              </div>
            </div>
          </div>
        </div>

        {/* Real-time Statistics */}
        <div className="bg-gradient-to-r from-primary/5 to-accent/5 rounded-2xl p-8 text-center border border-primary/10">
          <h3 className="text-2xl font-bold mb-8 text-foreground">Live Call Center Metrics</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl p-6 backdrop-blur-sm border border-primary/30 hover:shadow-lg hover:shadow-primary/10 transition-all duration-300">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/20 mb-4 mx-auto">
                <Phone className="h-6 w-6 text-primary" />
              </div>
              <div className="text-4xl font-bold bg-gradient-to-br from-primary to-primary/70 bg-clip-text text-transparent mb-3">1,247</div>
              <div className="text-sm text-muted-foreground font-medium">Calls Made Today</div>
              <div className="text-xs text-primary/60 mt-1">↗ +12% from yesterday</div>
            </div>
            <div className="bg-gradient-to-br from-green-500/5 to-green-500/10 rounded-xl p-6 backdrop-blur-sm border border-green-500/30 hover:shadow-lg hover:shadow-green-500/10 transition-all duration-300">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-green-500/20 mb-4 mx-auto">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
              <div className="text-4xl font-bold bg-gradient-to-br from-green-600 to-green-500 bg-clip-text text-transparent mb-3">94.2%</div>
              <div className="text-sm text-muted-foreground font-medium">Success Rate</div>
              <div className="text-xs text-green-600/60 mt-1">↗ +3.2% this month</div>
            </div>
            <div className="bg-gradient-to-br from-blue-500/5 to-blue-500/10 rounded-xl p-6 backdrop-blur-sm border border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-300">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-blue-500/20 mb-4 mx-auto">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
              <div className="text-4xl font-bold bg-gradient-to-br from-blue-600 to-blue-500 bg-clip-text text-transparent mb-3">2m 43s</div>
              <div className="text-sm text-muted-foreground font-medium">Avg Call Duration</div>
              <div className="text-xs text-blue-600/60 mt-1">Perfect engagement time</div>
            </div>
            <div className="bg-gradient-to-br from-purple-500/5 to-purple-500/10 rounded-xl p-6 backdrop-blur-sm border border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-300">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-purple-500/20 mb-4 mx-auto">
                <Users className="h-6 w-6 text-purple-600" />
              </div>
              <div className="text-4xl font-bold bg-gradient-to-br from-purple-600 to-purple-500 bg-clip-text text-transparent mb-3">87%</div>
              <div className="text-sm text-muted-foreground font-medium">Collection Success</div>
              <div className="text-xs text-purple-600/60 mt-1">Industry leading rate</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
