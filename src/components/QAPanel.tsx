import { useState } from "react";

import type { QAMock } from "../types";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

interface QAPanelProps {
  items: QAMock[];
}

export function QAPanel({ items }: QAPanelProps): JSX.Element {
  const [expandedIndexMap, setExpandedIndexMap] = useState<Record<number, boolean>>({});

  const toggleCard = (index: number): void => {
    setExpandedIndexMap((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {items.map((item, index) => {
        const isExpanded = expandedIndexMap[index] ?? false;
        return (
          <Card key={`${item.question}-${index}`} className="border-zinc-200/80 bg-white/90 dark:border-zinc-800 dark:bg-zinc-900/90">
            <CardHeader className="space-y-2">
              <CardDescription className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                PhD Interview Drill
              </CardDescription>
              <CardTitle className="text-base leading-relaxed">{item.question}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" size="sm" onClick={() => toggleCard(index)}>
                {isExpanded ? "Hide Answer Points" : "Reveal Suggested Answer Points"}
              </Button>

              {isExpanded ? (
                <ul className="space-y-2 rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-200">
                  {item.suggestedAnswerPoints.map((point) => (
                    <li key={point} className="leading-relaxed">
                      - {point}
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
