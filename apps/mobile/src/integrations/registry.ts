/** All data sources, in the order the Data sources screen lists them and the refresh runs them. */
import { calendarIntegration } from './calendar';
import { healthIntegration } from './health';
import { locationIntegration } from './location';
import { soundIntegration } from './sound';
import type { Integration, IntegrationId } from './types';
import { weatherIntegration } from './weather';

export const INTEGRATIONS: Integration[] = [weatherIntegration, healthIntegration, calendarIntegration, locationIntegration, soundIntegration];

export const integrationById = (id: IntegrationId) => INTEGRATIONS.find((i) => i.id === id) as Integration;
