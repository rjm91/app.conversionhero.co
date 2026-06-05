import SynergySprayFoam from '../../../components/funnels/synergy-spray-foam/SynergySprayFoam'

// Dev preview of the production funnel — tracking is disabled so dev hits don't
// pollute the live ch014 visitor/lead counts. To iterate on design, edit
// components/funnels/synergy-spray-foam/* and reload this page.
export default function FunnelPreviewPage() {
  return <SynergySprayFoam disableTracking />
}
