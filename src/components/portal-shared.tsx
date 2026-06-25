import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tabContentVariants } from "./motion-variants";

export interface PortalTabConfig {
  value: string;
  icon: ReactNode;
  label: string;
  pulse?: boolean;
}

export function PortalTabBar({
  tabs, activeTab, onTabChange, children,
}: {
  tabs: PortalTabConfig[];
  activeTab: string;
  onTabChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange}>
      <div className="overflow-x-auto pb-1">
        <TabsList className="inline-flex w-auto min-w-full sm:min-w-0 h-auto flex-nowrap gap-0.5 p-1">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}
              className="whitespace-nowrap text-xs sm:text-sm gap-1.5 relative">
              {tab.icon} {tab.label}
              {tab.pulse && (
                <motion.span
                  animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }}
                  className="absolute -top-1 -right-1 w-2 h-2 bg-violet-500 rounded-full"
                />
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {children}
    </Tabs>
  );
}

export function PortalTabContent({
  value, className = "", children,
}: {
  value: string; className?: string; children: ReactNode;
}) {
  return (
    <TabsContent value={value} className={className}>
      <motion.div
        variants={tabContentVariants}
        initial="hidden"
        animate="show"
      >
        {children}
      </motion.div>
    </TabsContent>
  );
}
