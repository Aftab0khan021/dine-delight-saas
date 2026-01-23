import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

type TimeSlot = {
    open: string;
    close: string;
};

type DaySchedule = TimeSlot[];

type WeeklyHours = {
    monday: DaySchedule;
    tuesday: DaySchedule;
    wednesday: DaySchedule;
    thursday: DaySchedule;
    friday: DaySchedule;
    saturday: DaySchedule;
    sunday: DaySchedule;
};

const DAYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
] as const;

const DAY_LABELS: Record<typeof DAYS[number], string> = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
};

interface OperatingHoursEditorProps {
    value: WeeklyHours;
    onChange: (hours: WeeklyHours) => void;
    maxVariantsPerItem?: number;
    onMaxVariantsChange?: (max: number) => void;
}

export function OperatingHoursEditor({
    value,
    onChange,
    maxVariantsPerItem = 5,
    onMaxVariantsChange,
}: OperatingHoursEditorProps) {
    const [selectedDay, setSelectedDay] = useState<typeof DAYS[number]>("monday");

    const addTimeSlot = (day: typeof DAYS[number]) => {
        const newHours = { ...value };
        newHours[day] = [
            ...(newHours[day] || []),
            { open: "09:00", close: "17:00" },
        ];
        onChange(newHours);
    };

    const removeTimeSlot = (day: typeof DAYS[number], index: number) => {
        const newHours = { ...value };
        newHours[day] = (newHours[day] || []).filter((_, i) => i !== index);
        onChange(newHours);
    };

    const updateTimeSlot = (
        day: typeof DAYS[number],
        index: number,
        field: "open" | "close",
        time: string
    ) => {
        const newHours = { ...value };
        if (!newHours[day]) newHours[day] = [];
        if (newHours[day][index]) {
            newHours[day][index][field] = time;
        }
        onChange(newHours);
    };

    const copySchedule = (fromDay: typeof DAYS[number]) => {
        const schedule = value[fromDay] || [];
        const newHours = { ...value };

        // Copy to all other days
        DAYS.forEach((day) => {
            if (day !== fromDay) {
                newHours[day] = JSON.parse(JSON.stringify(schedule));
            }
        });

        onChange(newHours);
    };

    const isClosed = (day: typeof DAYS[number]) => {
        return !value[day] || value[day].length === 0;
    };

    const toggleClosed = (day: typeof DAYS[number]) => {
        const newHours = { ...value };
        if (isClosed(day)) {
            newHours[day] = [{ open: "09:00", close: "17:00" }];
        } else {
            newHours[day] = [];
        }
        onChange(newHours);
    };

    return (
        <div className="space-y-6">
            {/* Variant Limit Setting */}
            {onMaxVariantsChange && (
                <Card>
                    <CardHeader>
                        <CardTitle>Menu Configuration</CardTitle>
                        <CardDescription>
                            Set limits for menu item customization
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-4">
                            <Label htmlFor="max-variants" className="min-w-[200px]">
                                Max Variants Per Item
                            </Label>
                            <Input
                                id="max-variants"
                                type="number"
                                min="1"
                                max="20"
                                value={maxVariantsPerItem}
                                onChange={(e) => onMaxVariantsChange(parseInt(e.target.value) || 5)}
                                className="w-24"
                            />
                            <span className="text-sm text-muted-foreground">
                                (e.g., Small, Medium, Large)
                            </span>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Operating Hours */}
            <Card>
                <CardHeader>
                    <CardTitle>Weekly Operating Hours</CardTitle>
                    <CardDescription>
                        Set your restaurant's regular operating hours for each day
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Day Tabs */}
                    <div className="flex flex-wrap gap-2">
                        {DAYS.map((day) => (
                            <Button
                                key={day}
                                variant={selectedDay === day ? "default" : "outline"}
                                size="sm"
                                onClick={() => setSelectedDay(day)}
                                className={cn(
                                    "relative",
                                    isClosed(day) && "opacity-50"
                                )}
                            >
                                {DAY_LABELS[day]}
                                {isClosed(day) && (
                                    <span className="ml-2 text-xs">(Closed)</span>
                                )}
                            </Button>
                        ))}
                    </div>

                    {/* Selected Day Schedule */}
                    <div className="border rounded-lg p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold">{DAY_LABELS[selectedDay]}</h3>
                            <div className="flex items-center gap-2">
                                <Label htmlFor={`closed-${selectedDay}`} className="text-sm">
                                    Closed
                                </Label>
                                <Switch
                                    id={`closed-${selectedDay}`}
                                    checked={isClosed(selectedDay)}
                                    onCheckedChange={() => toggleClosed(selectedDay)}
                                />
                            </div>
                        </div>

                        {!isClosed(selectedDay) && (
                            <>
                                {/* Time Slots */}
                                <div className="space-y-3">
                                    {(value[selectedDay] || []).map((slot, index) => (
                                        <div key={index} className="flex items-center gap-3">
                                            <div className="flex items-center gap-2 flex-1">
                                                <div className="flex-1">
                                                    <Label className="text-xs text-muted-foreground">
                                                        Open
                                                    </Label>
                                                    <Input
                                                        type="time"
                                                        value={slot.open}
                                                        onChange={(e) =>
                                                            updateTimeSlot(
                                                                selectedDay,
                                                                index,
                                                                "open",
                                                                e.target.value
                                                            )
                                                        }
                                                    />
                                                </div>
                                                <span className="text-muted-foreground pt-5">to</span>
                                                <div className="flex-1">
                                                    <Label className="text-xs text-muted-foreground">
                                                        Close
                                                    </Label>
                                                    <Input
                                                        type="time"
                                                        value={slot.close}
                                                        onChange={(e) =>
                                                            updateTimeSlot(
                                                                selectedDay,
                                                                index,
                                                                "close",
                                                                e.target.value
                                                            )
                                                        }
                                                    />
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => removeTimeSlot(selectedDay, index)}
                                                className="mt-5"
                                                disabled={(value[selectedDay] || []).length === 1}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>

                                {/* Add Time Slot */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => addTimeSlot(selectedDay)}
                                    className="w-full"
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Time Slot
                                </Button>

                                {/* Copy Schedule */}
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => copySchedule(selectedDay)}
                                    className="w-full"
                                >
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copy to All Days
                                </Button>
                            </>
                        )}
                    </div>

                    {/* Summary */}
                    <div className="bg-muted rounded-lg p-3 text-sm">
                        <p className="font-semibold mb-2">Weekly Summary:</p>
                        <div className="grid grid-cols-2 gap-2">
                            {DAYS.map((day) => (
                                <div key={day} className="flex justify-between">
                                    <span className="text-muted-foreground">
                                        {DAY_LABELS[day]}:
                                    </span>
                                    <span className="font-medium">
                                        {isClosed(day)
                                            ? "Closed"
                                            : (value[day] || [])
                                                .map((slot) => `${slot.open}-${slot.close}`)
                                                .join(", ")}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
