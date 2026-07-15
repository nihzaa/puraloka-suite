import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'default';

const COLORS: Record<BadgeVariant, { bg: string; text: string }> = {
  success: { bg: '#DCFCE7', text: '#15803D' },
  warning: { bg: '#FEF3C7', text: '#D97706' },
  danger: { bg: '#FEE2E2', text: '#B91C1C' },
  info: { bg: '#DBEAFE', text: '#1D4ED8' },
  default: { bg: '#F3F4F6', text: '#374151' },
};

export function Badge({ label, variant = 'default' }: { label: string; variant?: BadgeVariant }) {
  const { bg, text } = COLORS[variant];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: text }]}>{label}</Text>
    </View>
  );
}

export function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'active': return 'info';
    case 'completed': return 'success';
    case 'on_hold': return 'warning';
    case 'cancelled': return 'danger';
    case 'approved': return 'success';
    case 'rejected': return 'danger';
    case 'pending': return 'warning';
    case 'paid': return 'success';
    case 'unpaid': return 'danger';
    case 'overdue': return 'danger';
    default: return 'default';
  }
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    active: 'Aktif',
    completed: 'Selesai',
    on_hold: 'Ditunda',
    cancelled: 'Dibatalkan',
    planning: 'Perencanaan',
    approved: 'Disetujui',
    rejected: 'Ditolak',
    pending: 'Menunggu',
    paid: 'Lunas',
    unpaid: 'Belum Lunas',
    overdue: 'Jatuh Tempo',
    harian: 'Harian',
    borongan: 'Borongan',
    progress_pct: 'Progress %',
  };
  return map[status] ?? status;
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});
