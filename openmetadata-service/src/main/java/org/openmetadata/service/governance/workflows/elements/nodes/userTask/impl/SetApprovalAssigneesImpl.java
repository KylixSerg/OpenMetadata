package org.openmetadata.service.governance.workflows.elements.nodes.userTask.impl;

import static org.openmetadata.service.governance.workflows.Workflow.EXCEPTION_VARIABLE;
import static org.openmetadata.service.governance.workflows.Workflow.RELATED_ENTITY_VARIABLE;
import static org.openmetadata.service.governance.workflows.Workflow.WORKFLOW_RUNTIME_EXCEPTION;
import static org.openmetadata.service.governance.workflows.WorkflowHandler.getProcessDefinitionKeyFromId;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.flowable.common.engine.api.delegate.Expression;
import org.flowable.engine.delegate.BpmnError;
import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.JavaDelegate;
import org.openmetadata.schema.EntityInterface;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.Include;
import org.openmetadata.service.Entity;
import org.openmetadata.service.resources.feeds.MessageParser;
import org.openmetadata.service.util.JsonUtils;

@Slf4j
public class SetApprovalAssigneesImpl implements JavaDelegate {
  private Expression assigneesExpr;
  private Expression assigneesVarNameExpr;

  @Override
  public void execute(DelegateExecution execution) {
    try {
      Map<String, Object> assigneesConfig =
          JsonUtils.readOrConvertValue(assigneesExpr.getValue(execution), Map.class);
      Boolean addReviewers = (Boolean) assigneesConfig.get("addReviewers");
      Optional<List<EntityReference>> oExtraAssignees =
          Optional.ofNullable(
              JsonUtils.readOrConvertValue(assigneesConfig.get("extraAssignees"), List.class));

      List<String> assignees = new ArrayList<>();

      if (addReviewers) {
        MessageParser.EntityLink entityLink =
            MessageParser.EntityLink.parse((String) execution.getVariable(RELATED_ENTITY_VARIABLE));
        EntityInterface entity = Entity.getEntity(entityLink, "*", Include.ALL);
        assignees.addAll(getEntityLinkStringFromEntityReference(entity.getReviewers()));
      }

      oExtraAssignees.ifPresent(
          extraAssignees ->
              assignees.addAll(getEntityLinkStringFromEntityReference(extraAssignees)));

      execution.setVariableLocal(
          assigneesVarNameExpr.getValue(execution).toString(), JsonUtils.pojoToJson(assignees));
    } catch (Exception exc) {
      LOG.error(
          String.format(
              "[%s] Failure: ", getProcessDefinitionKeyFromId(execution.getProcessDefinitionId())),
          exc);
      execution.setVariable(EXCEPTION_VARIABLE, exc.toString());
      throw new BpmnError(WORKFLOW_RUNTIME_EXCEPTION, exc.getMessage());
    }
  }

  private List<String> getEntityLinkStringFromEntityReference(List<EntityReference> assignees) {
    return assignees.stream()
        .map(
            reviewer ->
                new MessageParser.EntityLink(reviewer.getType(), reviewer.getFullyQualifiedName())
                    .getLinkString())
        .toList();
  }
}