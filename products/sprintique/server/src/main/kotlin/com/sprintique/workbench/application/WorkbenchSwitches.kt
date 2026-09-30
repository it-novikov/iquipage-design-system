package com.sprintique.workbench.application

import com.sprintique.configuration.Feature
import com.sprintique.configuration.FeatureFlags
import org.springframework.stereotype.Component

/**
 * The Workbench paths that run inside other features' commands (a new task's author joins it) follow the same
 * switches as the Workbench routes (docs/adr W6 §7): turning `workbench_personal_state` off stops them too.
 */
@Component
class WorkbenchSwitches(flags: FeatureFlags) {
    init {
        PersonalState.joinsOnCreate = flags.isEnabled(Feature.WORKBENCH_PERSONAL_STATE)
    }
}
