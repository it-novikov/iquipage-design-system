package com.sprintique.web

import org.springframework.core.Ordered

/** The order of the servlet filters: measure everything, then headers, then admission, then body limits, then
 * switched-off features. */
object FilterOrder {
    const val METRICS = Ordered.HIGHEST_PRECEDENCE
    const val HEADERS = METRICS + 1
    const val LIMITS = HEADERS + 1
    const val BODY = LIMITS + 1
    const val FEATURES = BODY + 1
}
