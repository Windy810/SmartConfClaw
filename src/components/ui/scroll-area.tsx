import * as React from "react";

import { cn } from "../../lib/utils";

export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  viewportClassName?: string;
}

function ScrollArea({ className, viewportClassName, children, ...props }: ScrollAreaProps): JSX.Element {
  return (
    <div className={cn("relative overflow-hidden", className)} {...props}>
      <div className={cn("h-full w-full overflow-auto", viewportClassName)}>{children}</div>
    </div>
  );
}

export { ScrollArea };
