package com.sprintique.identity.application

/** A configured way into the product; the sign-in screen offers exactly these. */
fun interface SignInMethod {
    fun name(): String
}
