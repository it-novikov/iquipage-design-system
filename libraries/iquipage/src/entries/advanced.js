/* Public IQUIPAGE 0.5.7 browser ES entry. */
import {registerCore} from './core.js';
import m0 from './modules/roadmap.js';
import m1 from './modules/graph.js';
import m2 from './modules/remote-inputs.js';
import m3 from './modules/data-chart.js';
import m4 from './modules/advanced-core.js';
import m5 from './modules/image-crop.js';
export const IqRoadmap=m0.IqRoadmap;
export const IqGraph=m1.IqGraph;
export const IqRemoteCombobox=m2.IqRemoteCombobox;
export const IqTagInput=m2.IqTagInput;
export const IqDataChart=m3.IqDataChart;
export const validateRoadmap=m4.validateRoadmap;
export const roadmapConflicts=m4.roadmapConflicts;
export const validateGraph=m4.graphData;
export const layoutGraph=m4.layoutGraph;
export const normalizeChartData=m4.chartData;
export const IqImageCrop=m5.IqImageCrop;
export const cropRect=m5.cropRect;
export function registerAdvanced(){
 registerCore();
 for(const [name,ctor]of Object.entries({'iq-roadmap':IqRoadmap,'iq-graph':IqGraph,'iq-remote-combobox':IqRemoteCombobox,'iq-tag-input':IqTagInput,'iq-data-chart':IqDataChart,'iq-image-crop':IqImageCrop}))if(!customElements.get(name))customElements.define(name,ctor);
}
