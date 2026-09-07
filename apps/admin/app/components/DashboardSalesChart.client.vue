<script setup lang="ts">
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { Bar } from 'vue-chartjs';

type SalesPoint = {
  date: string;
  amountCents: number;
  saleCount: number;
};

const props = defineProps<{
  series: SalesPoint[];
}>();

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const colorMode = useColorMode();
const currencyFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
});
const labelFormatter = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Africa/Johannesburg',
});
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const chartData = computed<ChartData<'bar'>>(() => ({
  labels: props.series.map(item => labelFormatter.format(new Date(`${item.date}T12:00:00+02:00`))),
  datasets: [
    {
      label: 'Net sales',
      data: props.series.map(item => item.amountCents / 100),
      backgroundColor: '#d79a72',
      hoverBackgroundColor: '#ba7654',
      borderRadius: 10,
      borderSkipped: false,
      maxBarThickness: 28,
    },
  ],
}));

const chartOptions = computed<ChartOptions<'bar'>>(() => {
  const dark = colorMode.value === 'dark';
  const textColor = dark ? '#f7eee8' : '#33251f';
  const mutedColor = dark ? 'rgba(247, 238, 232, 0.62)' : 'rgba(77, 58, 49, 0.62)';
  const gridColor = dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(91, 66, 54, 0.09)';

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: reduceMotion ? false : { duration: 450 },
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { display: false },
      tooltip: {
        displayColors: false,
        backgroundColor: dark ? '#211b19' : '#fffaf7',
        titleColor: textColor,
        bodyColor: textColor,
        borderColor: gridColor,
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: context => `Net sales: ${currencyFormatter.format(Number(context.raw ?? 0))}`,
          afterLabel: context => {
            const count = props.series[context.dataIndex]?.saleCount ?? 0;
            return `${count} ${count === 1 ? 'sale' : 'sales'}`;
          },
        },
      },
    },
    scales: {
      x: {
        border: { display: false },
        grid: { display: false },
        ticks: {
          color: mutedColor,
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8,
          font: { size: 11 },
        },
      },
      y: {
        beginAtZero: true,
        border: { display: false },
        grid: { color: gridColor },
        ticks: {
          color: mutedColor,
          maxTicksLimit: 5,
          padding: 8,
          callback: value => currencyFormatter.format(Number(value)),
          font: { size: 11 },
        },
      },
    },
  };
});
</script>

<template>
  <div class="sales-chart">
    <Bar
      :data="chartData"
      :options="chartOptions"
      aria-label="Net Paystack sales for the last 30 days"
    >
      Sales chart could not be displayed.
    </Bar>
  </div>
</template>

<style scoped>
.sales-chart {
  position: relative;
  width: 100%;
  height: clamp(17rem, 35vw, 24rem);
}
</style>
