package com.sprintique.identity.application

/** A way into the product that only the local artifact contributes (dev login); the others are reported directly. */
fun interface SignInMethod {
    fun name(): String
}
