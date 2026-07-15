import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { useAuth } from '@/hooks/useAuth';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: focused ? 22 : 20, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>;
}

const C = { navy: '#003366', gray: '#9CA3AF' };

export default function AppLayout() {
  const { user } = useAuth();
  const role = user?.role ?? 'client';

  const showMandorTabs = role === 'mandor' || role === 'admin';
  const showPMTabs = role === 'pm' || role === 'admin';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.navy,
        tabBarInactiveTintColor: C.gray,
        tabBarStyle: {
          borderTopColor: '#E5E7EB',
          backgroundColor: '#fff',
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="proyek/index"
        options={{
          title: 'Proyek',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏗️" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="proyek/[id]"
        options={{ href: null }}
      />

      {/* Mandor-only: input progress + kasbon */}
      <Tabs.Screen
        name="progress/input"
        options={
          showMandorTabs
            ? {
                title: 'Progress',
                tabBarIcon: ({ focused }) => <TabIcon emoji="📷" focused={focused} />,
              }
            : { href: null }
        }
      />
      <Tabs.Screen
        name="kasbon/index"
        options={
          showMandorTabs
            ? {
                title: 'Kasbon',
                tabBarIcon: ({ focused }) => <TabIcon emoji="💵" focused={focused} />,
              }
            : { href: null }
        }
      />
      <Tabs.Screen
        name="kasbon/ajukan"
        options={{ href: null }}
      />

      {/* PM-only: mandor summary */}
      <Tabs.Screen
        name="mandor/index"
        options={
          showPMTabs
            ? {
                title: 'Mandor',
                tabBarIcon: ({ focused }) => <TabIcon emoji="👷" focused={focused} />,
              }
            : { href: null }
        }
      />

      <Tabs.Screen
        name="notifications/index"
        options={{
          title: 'Notifikasi',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔔" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
