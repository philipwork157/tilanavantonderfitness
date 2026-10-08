import type { Metadata } from 'next';
import { ProgramsView } from './programs-view';

export const metadata: Metadata = { title: 'Programs' };

export default function ProgramsPage() {
  return <ProgramsView />;
}
