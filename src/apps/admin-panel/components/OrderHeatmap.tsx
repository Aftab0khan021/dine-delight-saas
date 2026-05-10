import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getHours, getDay } from "date-fns";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS = [
  "12a","1a","2a","3a","4a","5a","6a","7a","8a","9a","10a","11a",
  "12p","1p","2p","3p","4p","5p","6p","7p","8p","9p","10p","11p",
];

interface OrderHeatmapProps {
  orders: Array<{ created_at: string }>;
}

export default function OrderHeatmap({ orders }: OrderHeatmapProps) {
  const heatmap = useMemo(() => {
    // 7 days x 24 hours matrix
    const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;

    for (const o of orders) {
      const d = new Date(o.created_at);
      const day = getDay(d);
      const hour = getHours(d);
      matrix[day][hour]++;
      if (matrix[day][hour] > max) max = matrix[day][hour];
    }

    return { matrix, max };
  }, [orders]);

  const getColor = (count: number) => {
    if (count === 0) return "bg-muted/30";
    const intensity = count / Math.max(heatmap.max, 1);
    if (intensity > 0.75) return "bg-emerald-500";
    if (intensity > 0.5) return "bg-emerald-400";
    if (intensity > 0.25) return "bg-emerald-300";
    return "bg-emerald-200";
  };

  // Find peak hour
  let peakDay = 0, peakHour = 0, peakCount = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (heatmap.matrix[d][h] > peakCount) {
        peakDay = d; peakHour = h; peakCount = heatmap.matrix[d][h];
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Order Heatmap</CardTitle>
        <CardDescription>
          Busiest ordering times. 
          {peakCount > 0 && (
            <span className="text-foreground font-medium">
              {" "}Peak: {DAY_LABELS[peakDay]} at {HOUR_LABELS[peakHour]} ({peakCount} orders)
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Hour labels */}
            <div className="flex items-center gap-0.5 mb-1 ml-10">
              {HOUR_LABELS.filter((_, i) => i % 3 === 0).map((label, i) => (
                <div key={i} className="text-[10px] text-muted-foreground" style={{ width: `${(100 / 8)}%` }}>
                  {label}
                </div>
              ))}
            </div>

            {/* Grid */}
            {DAY_LABELS.map((day, dayIdx) => (
              <div key={dayIdx} className="flex items-center gap-0.5 mb-0.5">
                <span className="text-xs text-muted-foreground w-8 text-right mr-1.5 shrink-0">{day}</span>
                {Array.from({ length: 24 }).map((_, hourIdx) => (
                  <div
                    key={hourIdx}
                    className={`flex-1 h-5 rounded-sm ${getColor(heatmap.matrix[dayIdx][hourIdx])} transition-colors hover:ring-1 hover:ring-foreground/20 cursor-default`}
                    title={`${day} ${HOUR_LABELS[hourIdx]}: ${heatmap.matrix[dayIdx][hourIdx]} orders`}
                  />
                ))}
              </div>
            ))}

            {/* Legend */}
            <div className="flex items-center gap-2 mt-3 ml-10 text-[10px] text-muted-foreground">
              <span>Less</span>
              <div className="h-3 w-3 rounded-sm bg-muted/30" />
              <div className="h-3 w-3 rounded-sm bg-emerald-200" />
              <div className="h-3 w-3 rounded-sm bg-emerald-300" />
              <div className="h-3 w-3 rounded-sm bg-emerald-400" />
              <div className="h-3 w-3 rounded-sm bg-emerald-500" />
              <span>More</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
