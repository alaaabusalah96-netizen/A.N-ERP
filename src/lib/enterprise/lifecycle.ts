import { FsmConfig, FsmTransitionResult } from '../../types/enterprise';

/**
 * 3.3 Generic Document Lifecycle Engine
 * محرك دورة حياة المستندات العام (آلة الحالات المحدودة)
 * 
 * An isolated, highly reusable component to handle state transitions for any document type.
 * Ensures consistent transition validations, security/role clearance, and side effect triggers.
 * Strictly adheres to "Additive Only" and "Backward Compatibility" principles.
 */
export class DocumentLifecycleEngine<TState extends string = string, TEvent extends string = string, TContext = any> {
  private config: FsmConfig<TState, TEvent, TContext>;

  constructor(config: FsmConfig<TState, TEvent, TContext>) {
    this.config = config;
  }

  /**
   * Retrieves the FSM Configuration.
   */
  getConfig(): FsmConfig<TState, TEvent, TContext> {
    return this.config;
  }

  /**
   * Retrieves all valid transitions from the current state.
   */
  getAvailableTransitions(currentState: TState): typeof this.config.transitions {
    return this.config.transitions.filter(t => t.from === currentState);
  }

  /**
   * Verifies if a specific event can be triggered from the current state, 
   * checking user role authority and guard criteria.
   */
  async canTransition(
    currentState: TState,
    event: TEvent,
    userRole: string,
    context: TContext
  ): Promise<{ can: boolean; reasonAr: string; reasonEn: string }> {
    const matchingTransitions = this.config.transitions.filter(
      t => t.from === currentState && t.event === event
    );

    if (matchingTransitions.length === 0) {
      return {
        can: false,
        reasonAr: `الانتقال غير مسموح به من الحالة الحالية (${currentState}) عبر الحدث (${event})`,
        reasonEn: `Transition is not allowed from the current state (${currentState}) via event (${event})`
      };
    }

    let lastResult: { can: boolean; reasonAr: string; reasonEn: string } | null = null;

    for (const transition of matchingTransitions) {
      // Check Role Authority
      if (transition.authorizedRoles && transition.authorizedRoles.length > 0) {
        if (!transition.authorizedRoles.includes(userRole)) {
          lastResult = {
            can: false,
            reasonAr: `غير مصرح لدور المستخدم (${userRole}) بتنفيذ هذا الإجراء`,
            reasonEn: `User role (${userRole}) is not authorized to execute this action`
          };
          continue;
        }
      }

      // Check Guard Conditions
      if (transition.guard) {
        try {
          const guardPassed = await transition.guard(context);
          if (!guardPassed) {
            lastResult = {
              can: false,
              reasonAr: `لم يتم استيفاء شروط التحقق المسبقة للانتقال`,
              reasonEn: `Pre-conditions for this transition were not met`
            };
            continue;
          }
        } catch (err: any) {
          lastResult = {
            can: false,
            reasonAr: `فشل التحقق المسبق: ${err.message}`,
            reasonEn: `Pre-condition check failed: ${err.message}`
          };
          continue;
        }
      }

      // If we reach here, this transition is fully valid and authorized!
      return {
        can: true,
        reasonAr: 'الانتقال متاح',
        reasonEn: 'Transition is available'
      };
    }

    // If none of the matching transitions succeeded, return the last error encountered
    return lastResult!;
  }

  /**
   * Performs the transition, running validation guards, post-transition actions, and returning the result.
   */
  async triggerTransition(
    currentState: TState,
    event: TEvent,
    userRole: string,
    context: TContext
  ): Promise<FsmTransitionResult<TState>> {
    const matchingTransitions = this.config.transitions.filter(
      t => t.from === currentState && t.event === event
    );

    if (matchingTransitions.length === 0) {
      return {
        success: false,
        fromState: currentState,
        toState: currentState,
        messageAr: `انتقال غير صالح للحدث (${event}) من الحالة (${currentState})`,
        messageEn: `Invalid transition for event (${event}) from state (${currentState})`
      };
    }

    let chosenTransition: typeof this.config.transitions[0] | null = null;
    let lastErrorClearance: { can: boolean; reasonAr: string; reasonEn: string } | null = null;

    for (const transition of matchingTransitions) {
      // Check Role Authority
      if (transition.authorizedRoles && transition.authorizedRoles.length > 0) {
        if (!transition.authorizedRoles.includes(userRole)) {
          lastErrorClearance = {
            can: false,
            reasonAr: `غير مصرح لدور المستخدم (${userRole}) بتنفيذ هذا الإجراء`,
            reasonEn: `User role (${userRole}) is not authorized to execute this action`
          };
          continue;
        }
      }

      // Check Guard Conditions
      if (transition.guard) {
        try {
          const guardPassed = await transition.guard(context);
          if (!guardPassed) {
            lastErrorClearance = {
              can: false,
              reasonAr: `لم يتم استيفاء شروط التحقق المسبقة للانتقال`,
              reasonEn: `Pre-conditions for this transition were not met`
            };
            continue;
          }
        } catch (err: any) {
          lastErrorClearance = {
            can: false,
            reasonAr: `فشل التحقق المسبق: ${err.message}`,
            reasonEn: `Pre-condition check failed: ${err.message}`
          };
          continue;
        }
      }

      // Found the first valid matching transition!
      chosenTransition = transition;
      break;
    }

    if (!chosenTransition) {
      return {
        success: false,
        fromState: currentState,
        toState: currentState,
        messageAr: lastErrorClearance?.reasonAr || `فشل التحقق المسبق للانتقال للحدث (${event})`,
        messageEn: lastErrorClearance?.reasonEn || `Pre-condition check failed for transition event (${event})`
      };
    }

    // Execute the post-transition action hook
    if (chosenTransition.action) {
      try {
        await chosenTransition.action(context);
      } catch (actionErr: any) {
        return {
          success: false,
          fromState: currentState,
          toState: currentState,
          messageAr: `فشل تنفيذ الإجراء اللاحق: ${actionErr.message}`,
          messageEn: `Failed to execute post-transition action: ${actionErr.message}`
        };
      }
    }

    return {
      success: true,
      fromState: currentState,
      toState: chosenTransition.to,
      messageAr: `تم الانتقال بنجاح إلى: ${this.config.states[chosenTransition.to]?.labelAr || chosenTransition.to}`,
      messageEn: `Transitioned successfully to: ${this.config.states[chosenTransition.to]?.labelEn || chosenTransition.to}`
    };
  }
}
