import { useState, useEffect } from "react";
import Navigation from "@/components/marketing/Navigation";
import SEO from "@/components/marketing/SEO";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, RadarOverview, TimeseriesResponse, TopAgent, TopOrigin } from "@/lib/api";
import { Activity, CheckCircle, XCircle, Globe, Bot } from "lucide-react";

type WindowType = 'today' | '7d';

const Radar = () => {
  const [window, setWindow] = useState<WindowType>('7d');
  const [overview, setOverview] = useState<RadarOverview | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesResponse | null>(null);
  const [topAgents, setTopAgents] = useState<TopAgent[]>([]);
  const [topOrigins, setTopOrigins] = useState<TopOrigin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const [overviewData, verifiedSeries, agentsData, originsData] = await Promise.all([
          api.getRadarOverview(window),
          api.getRadarTimeseries('verified', window),
          api.getTopAgents(window, 10),
          api.getTopOrigins(window, 10),
        ]);
        
        setOverview(overviewData);
        setTimeseries(verifiedSeries);
        setTopAgents(agentsData);
        setTopOrigins(originsData);
      } catch (err) {
        console.error('Radar fetch error:', err);
        setError('Failed to load Radar data. The service may be starting up.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [window]);

  // Simple SVG Line Chart component
  const SimpleLineChart = ({ data, color = '#22c55e' }: { data: { date: string; count: number }[]; color?: string }) => {
    if (!data || data.length === 0) {
      return (
        <div className="h-48 flex items-center justify-center text-muted-foreground">
          No data available
        </div>
      );
    }

    const maxCount = Math.max(...data.map(d => d.count), 1);
    const width = 600;
    const height = 180;
    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const points = data.map((d, i) => ({
      x: padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth,
      y: padding.top + chartHeight - (d.count / maxCount) * chartHeight,
      ...d,
    }));

    const pathD = points.reduce((acc, p, i) => {
      return acc + (i === 0 ? `M ${p.x},${p.y}` : ` L ${p.x},${p.y}`);
    }, '');

    const areaD = pathD + ` L ${points[points.length - 1]?.x || padding.left},${height - padding.bottom} L ${padding.left},${height - padding.bottom} Z`;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={padding.top + chartHeight * (1 - ratio)}
              y2={padding.top + chartHeight * (1 - ratio)}
              stroke="currentColor"
              strokeOpacity={0.1}
            />
            <text
              x={padding.left - 10}
              y={padding.top + chartHeight * (1 - ratio) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-xs"
            >
              {Math.round(maxCount * ratio)}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaD} fill={color} fillOpacity={0.1} />

        {/* Line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth={2} />

        {/* Data points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={4} fill={color} />
        ))}

        {/* X-axis labels */}
        {points.filter((_, i) => i % Math.ceil(points.length / 5) === 0 || i === points.length - 1).map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={height - 10}
            textAnchor="middle"
            className="fill-muted-foreground text-xs"
          >
            {new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </text>
        ))}
      </svg>
    );
  };

  const StatCard = ({ 
    title, 
    value, 
    icon: Icon, 
    color = 'text-foreground' 
  }: { 
    title: string; 
    value: number | string; 
    icon: React.ElementType; 
    color?: string;
  }) => (
    <Card className="border shadow-sm">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={`text-3xl font-bold ${color}`}>
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
          </div>
          <Icon className={`w-8 h-8 ${color} opacity-60`} />
        </div>
      </CardContent>
    </Card>
  );

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "OpenBotAuth Radar",
    "description": "Real-time ecosystem telemetry for the OpenBotAuth network",
    "url": `${globalThis.location?.origin || ''}/radar`,
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Radar - Ecosystem Telemetry"
        description="Real-time insights into the OpenBotAuth ecosystem. View verified requests, top agents, and publisher adoption."
        canonical="/radar"
        keywords="bot telemetry, agent analytics, crawler statistics, OpenBotAuth radar"
        structuredData={structuredData}
      />
      <Navigation />

      <main className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-4xl font-bold text-foreground">
              OpenBotAuth Radar
            </h1>
            <p className="text-muted-foreground mt-2">
              Real-time ecosystem telemetry for verified agent requests
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={window === 'today' ? 'default' : 'outline'}
              onClick={() => setWindow('today')}
            >
              Today
            </Button>
            <Button
              variant={window === '7d' ? 'default' : 'outline'}
              onClick={() => setWindow('7d')}
            >
              7 Days
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Activity className="w-12 h-12 animate-pulse text-emerald-600 mx-auto mb-4" />
              <p className="text-muted-foreground">Loading Radar data...</p>
            </div>
          </div>
        ) : error ? (
          <Card className="border-amber-500 bg-amber-50">
            <CardContent className="pt-6">
              <p className="text-amber-700">{error}</p>
              <p className="text-sm text-muted-foreground mt-2">
                Radar data requires the registry and verifier services to be running with telemetry enabled.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                title="Signed Requests"
                value={overview?.signed || 0}
                icon={Activity}
                color="text-blue-600"
              />
              <StatCard
                title="Verified"
                value={overview?.verified || 0}
                icon={CheckCircle}
                color="text-emerald-600"
              />
              <StatCard
                title="Failed"
                value={overview?.failed || 0}
                icon={XCircle}
                color="text-red-600"
              />
              <StatCard
                title="Unique Agents"
                value={overview?.unique_agents || 0}
                icon={Bot}
                color="text-purple-600"
              />
            </div>

            {/* Chart */}
            <Card className="mb-8 border shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-600" />
                  Verified Requests ({window === 'today' ? 'Today' : '7 Days'})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleLineChart data={timeseries?.points || []} color="#059669" />
              </CardContent>
            </Card>

            {/* Tables */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Top Agents */}
              <Card className="border shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="w-5 h-5 text-purple-600" />
                    Top Agents
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {topAgents.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No agent data yet</p>
                  ) : (
                    <div className="space-y-2">
                      {topAgents.map((agent, i) => (
                        <div
                          key={agent.agent_id || i}
                          className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {agent.client_name || agent.agent_id || 'Unknown'}
                            </p>
                            {agent.client_name && agent.agent_id && (
                              <p className="text-xs text-muted-foreground truncate">
                                {agent.agent_id}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="text-emerald-600 font-medium" title="Verified">
                              {agent.verified_count.toLocaleString()}
                            </span>
                            {agent.failed_count > 0 && (
                              <span className="text-red-600 font-medium" title="Failed">
                                {agent.failed_count.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top Origins */}
              <Card className="border shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-blue-600" />
                    Top Origins
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {topOrigins.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No origin data yet</p>
                  ) : (
                    <div className="space-y-2">
                      {topOrigins.map((origin, i) => (
                        <div
                          key={origin.origin || i}
                          className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                        >
                          <p className="font-medium truncate flex-1 min-w-0">
                            {origin.origin?.replace(/^https?:\/\//, '') || 'Unknown'}
                          </p>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="text-emerald-600 font-medium" title="Verified">
                              {origin.verified_count.toLocaleString()}
                            </span>
                            {origin.failed_count > 0 && (
                              <span className="text-red-600 font-medium" title="Failed">
                                {origin.failed_count.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Footer note */}
            <p className="text-center text-sm text-muted-foreground mt-8">
              Radar shows ecosystem-wide metrics. Individual agent karma stats are available on profile pages.
            </p>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Radar;

