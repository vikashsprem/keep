"use client"; // Add this line at the top to make this a Client Component

import React, {
  useState,
  useEffect,
  Dispatch,
  SetStateAction,
  useMemo,
} from "react";
import { GenericTable } from "@/components/table/GenericTable";
import { useAlertQualityMetrics } from "utils/hooks/useAlertQuality";
import { useProviders } from "utils/hooks/useProviders";
import { Provider, ProvidersResponse } from "app/providers/providers";
import { TabGroup, TabList, Tab } from "@tremor/react";
import { GenericFilters } from "@/components/filters/GenericFilters";
import { useSearchParams } from "next/navigation";
import { AlertKnownKeys } from "./models";

const tabs = [
  { name: "All", value: "all" },
  { name: "Installed", value: "installed" },
];

const ALERT_QUALITY_FILTERS = [
  {
    type: "date",
    key: "time_stamp",
    value: "",
    name: "Last received",
  },
];

export const FilterTabs = ({
  tabs,
  setTab,
  tab,
}: {
  tabs: { name: string; value: string }[];
  setTab: Dispatch<SetStateAction<number>>;
  tab: number;
}) => {
  return (
    <div className="max-w-lg space-y-12 pt-6">
      <TabGroup
        index={tab}
        onIndexChange={(index: number) => {
          setTab(index);
        }}
      >
        <TabList variant="solid" color="black" className="bg-gray-300">
          {tabs.map((tabItem) => (
            <Tab key={tabItem.value}>{tabItem.name}</Tab>
          ))}
        </TabList>
      </TabGroup>
    </div>
  );
};

interface AlertMetricQuality {
  alertsReceived: number;
  alertsCorrelatedToIncidentsPercentage: number;
  alertsWithSeverityPercentage: number;
  [key: string]: number;
}

type FinalAlertQuality = (Provider &
  AlertMetricQuality & { provider_display_name: string })[];
interface Pagination {
  limit: number;
  offset: number;
}

const QualityTable = ({
  providersMeta,
  alertsQualityMetrics,
  isDashBoard,
  setFields,
  fieldsValue,
}: {
  providersMeta: ProvidersResponse | undefined;
  alertsQualityMetrics: Record<string, Record<string, any>> | undefined;
  isDashBoard?: boolean;
  setFields: (fields: string | string[] | Record<string, string>) => void;
  fieldsValue: string | string[] | Record<string, string>;
}) => {
  const [pagination, setPagination] = useState<Pagination>({
    limit: 10,
    offset: 0,
  });
  const customFieldFilter = {
    type: "select",
    key: "fields",
    value: isDashBoard ? fieldsValue : "",
    name: "Field",
    options: AlertKnownKeys.map((key) => ({ value: key, label: key })),
    // only_one: true,
    searchParamsNotNeed: isDashBoard,
    can_select: 3,
    setFilter: setFields,
  };
  const searchParams = useSearchParams();
  const entries = searchParams ? Array.from(searchParams.entries()) : [];
  const params = entries.reduce((acc, [key, value]) => {
    if (key in acc) {
      if (Array.isArray(acc[key])) {
        acc[key] = [...acc[key], value];
        return acc;
      } else {
        acc[key] = [acc[key] as string, value];
      }
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {} as Record<string, string | string[]>);
  function toArray(value: string | string[]) {
    if (!value) {
      return [];
    }

    if (!Array.isArray(value) && value) {
      return [value];
    }

    return value;
  }
  const fields = toArray(
    params?.["fields"] || (fieldsValue as string | string[]) || []
  ) as string[];
  const [tab, setTab] = useState(1);

  const handlePaginationChange = (newLimit: number, newOffset: number) => {
    setPagination({ limit: newLimit, offset: newOffset });
  };

  useEffect(() => {
    handlePaginationChange(10, 0);
  }, [tab, searchParams?.toString()]);

  // Construct columns based on the fields selected
  const columns = useMemo(() => {
    const baseColumns = [
      {
        header: "Provider Name",
        accessorKey: "provider_display_name",
      },
      {
        header: "Alerts Received",
        accessorKey: "alertsReceived",
      },
      {
        header: "% of Alerts Correlated to Incidents",
        accessorKey: "alertsCorrelatedToIncidentsPercentage",
        cell: (info: any) => `${info.getValue().toFixed(2)}%`,
      },
    ];

    // Add dynamic columns based on the fields
    const dynamicColumns = fields.map((field: string) => ({
      header: `% of Alerts Having ${
        field.charAt(0).toUpperCase() + field.slice(1)
      }`,
      accessorKey: `alertsWith${
        field.charAt(0).toUpperCase() + field.slice(1)
      }Percentage`,
      cell: (info: any) => `${info.getValue().toFixed(2)}%`,
    }));

    return [...baseColumns, ...dynamicColumns];
  }, [fields]);

  // Process data and include dynamic fields
  const finalData = useMemo(() => {
    let providers: Provider[] | null = null;

    if (!providersMeta || !alertsQualityMetrics) {
      return null;
    }

    switch (tab) {
      case 0:
        providers = providersMeta?.providers || providers;
        break;
      case 1:
        providers = providersMeta?.installed_providers || providers;
        break;
      default:
        providers = providersMeta?.providers || providers;
        break;
    }

    if (!providers) {
      return null;
    }

    const groupedMetrics: { [key: string]: any } = {};

    if (tab === 0) {
      // Iterate over each provider in the alertsMetrics object
      for (const provider in alertsQualityMetrics) {
        const metrics = alertsQualityMetrics[provider];
        const providerType = metrics.provider_type;

        // If the provider_type doesn't exist in the result, initialize it
        if (!groupedMetrics[providerType]) {
          groupedMetrics[providerType] = {
            total_alerts: 0,
            correlated_alerts: 0,
          };
        }

        // Aggregate the values for total_alerts, correlated_alerts, etc.
        groupedMetrics[providerType].total_alerts += metrics.total_alerts;
        groupedMetrics[providerType].correlated_alerts +=
          metrics.correlated_alerts;

        fields.forEach((field) => {
          const key = `${field}_count`;
          groupedMetrics[providerType][key] =
            groupedMetrics[providerType][key] || 0;
          groupedMetrics[providerType][key] += metrics[key];
        });
      }
    }

    const innerData: FinalAlertQuality = providers.map((provider) => {
      const providerId = provider.id;
      const providerType = provider.type;
      const key =`${providerId}_${providerType}`;
      const alertQuality = tab ===0 ? groupedMetrics[providerType] :  alertsQualityMetrics[key];
      const totalAlertsReceived = alertQuality?.total_alerts ?? 0;
      const correlated_alerts = alertQuality?.correlated_alerts ?? 0;
      const correltedPert =
        totalAlertsReceived && correlated_alerts
          ? (correlated_alerts / totalAlertsReceived) * 100
          : 0;
      const severityPert = totalAlertsReceived
        ? ((alertQuality?.severity_count ?? 0) / totalAlertsReceived) * 100
        : 0;

      // Calculate percentages for dynamic fields
      const dynamicFieldPercentages = fields.reduce((acc, field: string) => {
        acc[
          `alertsWith${
            field.charAt(0).toUpperCase() + field.slice(1)
          }Percentage`
        ] = totalAlertsReceived
          ? ((alertQuality?.[`${field}_count`] ?? 0) / totalAlertsReceived) *
            100
          : 0;
        return acc;
      }, {} as Record<string, number>);

      return {
        ...provider,
        alertsReceived: totalAlertsReceived,
        alertsCorrelatedToIncidentsPercentage: correltedPert,
        alertsWithSeverityPercentage: severityPert,
        ...dynamicFieldPercentages, // Add dynamic field percentages here
        provider_display_name:
          provider?.details?.name ? `${provider.details.name} (${provider.display_name})` : provider.display_name || "",
      } as FinalAlertQuality[number];
    });

    return innerData;
  }, [tab, providersMeta, alertsQualityMetrics, fields]);

  return (
    <div
      className={`flex flex-col gap-2 p-2 px-4 ${isDashBoard ? "h-[90%]" : ""}`}
    >
      <div>
        {!isDashBoard && (
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
            Alert Quality Dashboard
          </h1>
        )}
        <div className="flex justify-end items-end mb-4">
          {/* if we want to use tabs. we can enable it */}
          {/* <FilterTabs tabs={tabs} setTab={setTab} tab={tab} /> */}
          <GenericFilters
            filters={
              isDashBoard
                ? [customFieldFilter]
                : [...ALERT_QUALITY_FILTERS, customFieldFilter]
            }
          />
        </div>
      </div>
      {finalData && (
        <GenericTable
          data={finalData}
          columns={columns}
          rowCount={finalData?.length}
          offset={pagination.offset}
          limit={pagination.limit}
          onPaginationChange={handlePaginationChange}
          dataFetchedAtOneGO={true}
          onRowClick={(row) => {
            console.log("Row clicked:", row);
          }}
        />
      )}
    </div>
  );
};

const AlertQuality = ({ isDashBoard }: { isDashBoard?: boolean }) => {
  const [fieldsValue, setFieldsValue] = useState<
    string | string[] | Record<string, string>
  >("severity");
  const { data: providersMeta } = useProviders();
  const { data: alertsQualityMetrics, error } = useAlertQualityMetrics(
    isDashBoard ? (fieldsValue as string) : ""
  );

  return (
    <QualityTable
      providersMeta={providersMeta}
      alertsQualityMetrics={alertsQualityMetrics}
      isDashBoard={isDashBoard}
      setFields={setFieldsValue}
      fieldsValue={fieldsValue}
    />
  );
};

export default AlertQuality;
