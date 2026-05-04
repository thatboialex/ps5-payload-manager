#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/time.h>
#include <unistd.h>

#include "pldmgr.h"
#include "preset_runner.h"
#include "payload_mgr.h"
#include "ps5_launcher.h"

#define PRESET_MAX_ITEMS 64
#define PRESET_ITEM_LEN 256

static pthread_mutex_t pr_mutex = PTHREAD_MUTEX_INITIALIZER;
static pthread_t pr_thread;

static char pr_items[PRESET_MAX_ITEMS][PRESET_ITEM_LEN];
static int pr_total_items = 0;        /* total entries (incl delays) */
static int pr_total_payloads = 0;     /* payload entries only */
static volatile int pr_done = 0;
static volatile int pr_active = 0;
static volatile int pr_abort_flag = 0;
static char pr_current[128] = "";
static volatile long long pr_delay_end_ms = 0;
static char pr_state[16] = "idle";

static long long pr_now_ms(void) {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return (long long)tv.tv_sec * 1000 + tv.tv_usec / 1000;
}

static void pr_set_state(const char *s) {
    strncpy(pr_state, s, sizeof(pr_state) - 1);
    pr_state[sizeof(pr_state) - 1] = '\0';
}

static void *pr_worker(void *arg) {
    (void)arg;
    pldmgr_log("[Preset] Immediate sequence start (%d items, %d payloads)\n",
               pr_total_items, pr_total_payloads);

    for (int i = 0; i < pr_total_items; i++) {
        if (pr_abort_flag) break;
        const char *item = pr_items[i];

        if (item[0] == '!') {
            int delay = atoi(item + 1);
            if (delay > 0) {
                pr_set_state("delay");
                strncpy(pr_current, item, sizeof(pr_current) - 1);
                pr_current[sizeof(pr_current) - 1] = '\0';
                pr_delay_end_ms = pr_now_ms() + delay;
                pldmgr_log("[Preset] Delay %d ms\n", delay);
                while (pr_now_ms() < pr_delay_end_ms) {
                    if (pr_abort_flag) break;
                    usleep(50 * 1000);
                }
                pr_delay_end_ms = 0;
                if (pr_abort_flag) break;
            }
        } else {
            char full_path[512];
            pr_set_state("launching");
            strncpy(pr_current, item, sizeof(pr_current) - 1);
            pr_current[sizeof(pr_current) - 1] = '\0';
            if (payload_mgr_resolve_path(item, full_path, sizeof(full_path)) == 0) {
                pldmgr_log("[Preset] Launching: %s\n", full_path);
                ps5_launch_elf(full_path);
            } else {
                pldmgr_log("[Preset] !!! Payload not found: %s\n", item);
            }
            pr_done++;
            usleep(500 * 1000); /* small spacing for stability + UI visibility */
        }
    }

    if (pr_abort_flag) {
        pr_set_state("aborted");
        pldmgr_log("[Preset] Sequence aborted\n");
    } else {
        pr_set_state("done");
        strncpy(pr_current, "DONE", sizeof(pr_current) - 1);
        pr_current[sizeof(pr_current) - 1] = '\0';
        pldmgr_log("[Preset] Sequence complete\n");
    }
    pr_active = 0;
    return NULL;
}

int preset_runner_start(const char *items[], int count) {
    pthread_mutex_lock(&pr_mutex);
    if (pr_active) {
        pthread_mutex_unlock(&pr_mutex);
        return -1;
    }
    if (!items || count <= 0) {
        pthread_mutex_unlock(&pr_mutex);
        return -1;
    }
    if (count > PRESET_MAX_ITEMS) count = PRESET_MAX_ITEMS;

    pr_total_items = 0;
    pr_total_payloads = 0;
    pr_done = 0;
    pr_abort_flag = 0;
    pr_current[0] = '\0';
    pr_delay_end_ms = 0;
    pr_set_state("launching");

    for (int i = 0; i < count; i++) {
        if (!items[i]) continue;
        strncpy(pr_items[pr_total_items], items[i], PRESET_ITEM_LEN - 1);
        pr_items[pr_total_items][PRESET_ITEM_LEN - 1] = '\0';
        if (pr_items[pr_total_items][0] != '!' && pr_items[pr_total_items][0] != '\0') {
            pr_total_payloads++;
        }
        pr_total_items++;
    }

    if (pr_total_items == 0) {
        pr_set_state("idle");
        pthread_mutex_unlock(&pr_mutex);
        return -1;
    }

    pr_active = 1;
    if (pthread_create(&pr_thread, NULL, pr_worker, NULL) != 0) {
        pr_active = 0;
        pr_set_state("error");
        pthread_mutex_unlock(&pr_mutex);
        return -1;
    }
    pthread_detach(pr_thread);
    pthread_mutex_unlock(&pr_mutex);
    return 0;
}

void preset_runner_abort(void) {
    if (pr_active) pr_abort_flag = 1;
}

void preset_runner_get_status(int *active, int *total, int *done,
                              char *current, size_t current_size,
                              long long *remaining_ms,
                              char *state, size_t state_size) {
    if (active) *active = pr_active;
    if (total) *total = pr_total_payloads;
    if (done) *done = pr_done;
    if (current && current_size > 0) {
        strncpy(current, pr_current, current_size - 1);
        current[current_size - 1] = '\0';
    }
    if (remaining_ms) {
        long long now = pr_now_ms();
        long long end = pr_delay_end_ms;
        *remaining_ms = (end > now) ? (end - now) : 0;
    }
    if (state && state_size > 0) {
        strncpy(state, pr_state, state_size - 1);
        state[state_size - 1] = '\0';
    }
}
