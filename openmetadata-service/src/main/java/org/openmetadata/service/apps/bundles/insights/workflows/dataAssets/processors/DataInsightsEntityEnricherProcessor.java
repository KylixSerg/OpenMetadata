package org.openmetadata.service.apps.bundles.insights.workflows.dataAssets.processors;

import static org.openmetadata.schema.EntityInterface.ENTITY_TYPE_TO_CLASS_MAP;
import static org.openmetadata.service.apps.bundles.insights.utils.TimestampUtils.END_TIMESTAMP_KEY;
import static org.openmetadata.service.apps.bundles.insights.utils.TimestampUtils.START_TIMESTAMP_KEY;
import static org.openmetadata.service.apps.bundles.insights.workflows.dataAssets.DataAssetsWorkflow.ENTITY_TYPE_FIELDS_KEY;
import static org.openmetadata.service.workflows.searchIndex.ReindexingUtil.ENTITY_TYPE_KEY;
import static org.openmetadata.service.workflows.searchIndex.ReindexingUtil.TIMESTAMP_KEY;
import static org.openmetadata.service.workflows.searchIndex.ReindexingUtil.getUpdatedStats;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.glassfish.jersey.internal.util.ExceptionUtils;
import org.openmetadata.common.utils.CommonUtil;
import org.openmetadata.schema.ColumnsEntityInterface;
import org.openmetadata.schema.EntityInterface;
import org.openmetadata.schema.entity.teams.User;
import org.openmetadata.schema.system.IndexingError;
import org.openmetadata.schema.system.StepStats;
import org.openmetadata.schema.type.ChangeDescription;
import org.openmetadata.schema.type.ChangeSummaryMap;
import org.openmetadata.schema.type.Column;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.Include;
import org.openmetadata.schema.type.TagLabel;
import org.openmetadata.schema.type.change.ChangeSource;
import org.openmetadata.schema.type.change.ChangeSummary;
import org.openmetadata.service.Entity;
import org.openmetadata.service.apps.bundles.insights.utils.TimestampUtils;
import org.openmetadata.service.exception.EntityNotFoundException;
import org.openmetadata.service.exception.SearchIndexException;
import org.openmetadata.service.jdbi3.EntityRepository;
import org.openmetadata.service.util.JsonUtils;
import org.openmetadata.service.util.ResultList;
import org.openmetadata.service.workflows.interfaces.Processor;

@Slf4j
public class DataInsightsEntityEnricherProcessor
    implements Processor<List<Map<String, Object>>, ResultList<? extends EntityInterface>> {

  private final StepStats stats = new StepStats();
  private static final Set<String> NON_TIER_ENTITIES = Set.of("tag", "glossaryTerm", "dataProduct");

  public DataInsightsEntityEnricherProcessor(int total) {
    this.stats.withTotalRecords(total).withSuccessRecords(0).withFailedRecords(0);
  }

  @Override
  public List<Map<String, Object>> process(
      ResultList<? extends EntityInterface> input, Map<String, Object> contextData)
      throws SearchIndexException {
    List<Map<String, Object>> enrichedMaps;
    try {
      enrichedMaps =
          input.getData().stream()
              .flatMap(
                  entity ->
                      getEntityVersions(entity, contextData).stream()
                          .flatMap(
                              entityVersionMap ->
                                  generateDailyEntitySnapshots(
                                      enrichEntity(entityVersionMap, contextData))
                                      .stream()))
              .toList();
      updateStats(input.getData().size(), 0);
    } catch (Exception e) {
      IndexingError error =
          new IndexingError()
              .withErrorSource(IndexingError.ErrorSource.PROCESSOR)
              .withSubmittedCount(input.getData().size())
              .withFailedCount(input.getData().size())
              .withSuccessCount(0)
              .withMessage(
                  String.format("Entities Enricher Encountered Failure: %s", e.getMessage()))
              .withStackTrace(ExceptionUtils.exceptionStackTraceAsString(e));
      LOG.debug(
          "[DataInsightsEntityEnricherProcessor] Failed. Details: {}", JsonUtils.pojoToJson(error));
      updateStats(0, input.getData().size());
      throw new SearchIndexException(error);
    }
    return enrichedMaps;
  }

  private List<Map<String, Object>> getEntityVersions(
      EntityInterface entity, Map<String, Object> contextData) {
    String entityType = (String) contextData.get(ENTITY_TYPE_KEY);
    Long endTimestamp = (Long) contextData.get(END_TIMESTAMP_KEY);
    Long startTimestamp = (Long) contextData.get(START_TIMESTAMP_KEY);
    EntityRepository<?> entityRepository = Entity.getEntityRepository(entityType);

    Long pointerTimestamp = endTimestamp;
    List<Map<String, Object>> entityVersions = new java.util.ArrayList<>();
    boolean historyDone = false;
    int nextOffset = 0;

    while (!historyDone) {
      EntityRepository.EntityHistoryWithOffset entityHistoryWithOffset =
          entityRepository.listVersionsWithOffset(entity.getId(), 100, nextOffset);
      List<Object> versions = entityHistoryWithOffset.entityHistory().getVersions();
      if (versions.isEmpty()) {
        break;
      }
      nextOffset = entityHistoryWithOffset.nextOffset();

      for (Object version : versions) {
        EntityInterface versionEntity =
            JsonUtils.readOrConvertValue(
                version, ENTITY_TYPE_TO_CLASS_MAP.get(entityType.toLowerCase()));
        Long versionTimestamp = TimestampUtils.getStartOfDayTimestamp(versionEntity.getUpdatedAt());
        if (versionTimestamp > pointerTimestamp) {
          continue;
        } else if (versionTimestamp < startTimestamp) {
          Map<String, Object> versionMap = new HashMap<>();

          versionMap.put("endTimestamp", pointerTimestamp);
          versionMap.put("startTimestamp", startTimestamp);
          versionMap.put("versionEntity", versionEntity);

          entityVersions.add(versionMap);
          historyDone = true;
          break;
        } else {
          Map<String, Object> versionMap = new HashMap<>();

          versionMap.put("endTimestamp", pointerTimestamp);
          versionMap.put("startTimestamp", TimestampUtils.getEndOfDayTimestamp(versionTimestamp));
          versionMap.put("versionEntity", versionEntity);

          entityVersions.add(versionMap);
          pointerTimestamp =
              TimestampUtils.getEndOfDayTimestamp(TimestampUtils.subtractDays(versionTimestamp, 1));
        }
      }
    }

    return entityVersions;
  }

  private Map<String, Object> enrichEntity(
      Map<String, Object> entityVersionMap, Map<String, Object> contextData) {
    EntityInterface entity = (EntityInterface) entityVersionMap.get("versionEntity");
    Long startTimestamp = (Long) entityVersionMap.get("startTimestamp");
    Long endTimestamp = (Long) entityVersionMap.get("endTimestamp");

    Map<String, Object> entityMap = JsonUtils.getMap(entity);
    entityMap.keySet().retainAll((List<String>) contextData.get(ENTITY_TYPE_FIELDS_KEY));

    String entityType = (String) contextData.get(ENTITY_TYPE_KEY);

    Map<String, ChangeSummary> changeSummaryMap =
        Optional.ofNullable(entity.getChangeDescription())
            .map(ChangeDescription::getChangeSummary)
            .map(ChangeSummaryMap::getAdditionalProperties)
            .orElse(null);

    // Enrich with EntityType
    if (CommonUtil.nullOrEmpty(entityType)) {
      throw new IllegalArgumentException(
          "[EsEntitiesProcessor] entityType cannot be null or empty.");
    }

    entityMap.put(ENTITY_TYPE_KEY, entityType);

    // Enrich with Timestamp
    entityMap.put("startTimestamp", startTimestamp);
    entityMap.put("endTimestamp", endTimestamp);

    // Process Description Source
    entityMap.put("descriptionSources", processDescriptionSources(entity, changeSummaryMap));

    // Process Tag Source
    TagAndTierSources tagAndTierSources = processTagAndTierSources(entity);
    entityMap.put("tagSources", tagAndTierSources.getTagSources());
    entityMap.put("tierSources", tagAndTierSources.getTierSources());

    // Process Team
    Optional.ofNullable(processTeam(entity)).ifPresent(team -> entityMap.put("team", team));

    // Process Tier
    Optional.ofNullable(processTier(entity)).ifPresent(tier -> entityMap.put("tier", tier));

    // Enrich with Description Stats
    entityMap.put("hasDescription", CommonUtil.nullOrEmpty(entity.getDescription()) ? 0 : 1);

    if (hasColumns(entity)) {
      entityMap.put("numberOfColumns", ((ColumnsEntityInterface) entity).getColumns().size());
      entityMap.put(
          "numberOfColumnsWithDescription",
          ((ColumnsEntityInterface) entity)
              .getColumns().stream()
                  .map(column -> CommonUtil.nullOrEmpty(column.getDescription()) ? 0 : 1)
                  .reduce(0, Integer::sum));
    }

    // Modify Custom Property key
    Optional<Object> oCustomProperties = Optional.ofNullable(entityMap.get("extension"));
    oCustomProperties.ifPresent(
        o -> entityMap.put(String.format("%sCustomProperty", entityType), o));

    return entityMap;
  }

  private boolean hasColumns(EntityInterface entity) {
    return List.of(entity.getClass().getInterfaces()).contains(ColumnsEntityInterface.class);
  }

  private String getDescriptionSource(
      String description, Map<String, ChangeSummary> changeSummaryMap, String changeSummaryKey) {
    if (description == null) {
      return null;
    }

    String descriptionSource = ChangeSource.INGESTED.value();

    if (changeSummaryMap != null) {
      if (changeSummaryMap.containsKey(changeSummaryKey)
          && changeSummaryMap.get(changeSummaryKey).getChangeSource() != null) {
        descriptionSource = changeSummaryMap.get(changeSummaryKey).getChangeSource().value();
      }
    }
    return descriptionSource;
  }

  private void processDescriptionSource(
      EntityInterface entity,
      Map<String, ChangeSummary> changeSummaryMap,
      Map<String, Integer> descriptionSources) {
    Optional.ofNullable(
            getDescriptionSource(entity.getDescription(), changeSummaryMap, "description"))
        .ifPresent(
            source ->
                descriptionSources.put(source, descriptionSources.getOrDefault(source, 0) + 1));
  }

  private void processColumnDescriptionSources(
      ColumnsEntityInterface entity,
      Map<String, ChangeSummary> changeSummaryMap,
      Map<String, Integer> descriptionSources) {
    for (Column column : entity.getColumns()) {
      Optional.ofNullable(
              getDescriptionSource(
                  column.getDescription(),
                  changeSummaryMap,
                  String.format("columns.%s.description", column.getName())))
          .ifPresent(
              source ->
                  descriptionSources.put(source, descriptionSources.getOrDefault(source, 0) + 1));
    }
  }

  private Map<String, Integer> processDescriptionSources(
      EntityInterface entity, Map<String, ChangeSummary> changeSummaryMap) {
    Map<String, Integer> descriptionSources = new HashMap<>();
    processDescriptionSource(entity, changeSummaryMap, descriptionSources);
    if (hasColumns(entity)) {
      processColumnDescriptionSources(
          (ColumnsEntityInterface) entity, changeSummaryMap, descriptionSources);
    }
    return descriptionSources;
  }

  private String processTeam(EntityInterface entity) {
    String team = null;
    Optional<List<EntityReference>> oEntityOwners = Optional.ofNullable(entity.getOwners());
    if (oEntityOwners.isPresent() && !oEntityOwners.get().isEmpty()) {
      EntityReference entityOwner = oEntityOwners.get().get(0);
      String ownerType = entityOwner.getType();
      if (ownerType.equals(Entity.TEAM)) {
        team = entityOwner.getName();
      } else {
        try {
          Optional<User> oOwner =
              Optional.ofNullable(
                  Entity.getEntityByName(
                      Entity.USER, entityOwner.getFullyQualifiedName(), "teams", Include.ALL));

          if (oOwner.isPresent()) {
            User owner = oOwner.get();
            List<EntityReference> teams = owner.getTeams();

            if (!teams.isEmpty()) {
              team = teams.get(0).getName();
            }
          }
        } catch (EntityNotFoundException ex) {
          // Note: If the Owner is deleted we can't infer the Teams for which the Data Asset
          // belonged.
          LOG.debug(
              String.format(
                  "Owner %s for %s '%s' version '%s' not found.",
                  entityOwner.getFullyQualifiedName(),
                  Entity.getEntityTypeFromObject(entity),
                  entity.getFullyQualifiedName(),
                  entity.getVersion()));
        }
      }
    }
    return team;
  }

  private void processTagAndTierSources(
      List<TagLabel> tagList, TagAndTierSources tagAndTierSources) {
    Optional.ofNullable(tagList)
        .ifPresent(
            tags -> {
              tags.forEach(
                  tag -> {
                    String tagSource = tag.getLabelType().value();
                    if (tag.getTagFQN().startsWith("Tier.")) {
                      tagAndTierSources
                          .getTierSources()
                          .put(
                              tagSource,
                              tagAndTierSources.getTierSources().getOrDefault(tagSource, 0) + 1);
                    } else {
                      tagAndTierSources
                          .getTagSources()
                          .put(
                              tagSource,
                              tagAndTierSources.getTagSources().getOrDefault(tagSource, 0) + 1);
                    }
                  });
            });
  }

  private void processEntityTagSources(
      EntityInterface entity, TagAndTierSources tagAndTierSources) {
    processTagAndTierSources(entity.getTags(), tagAndTierSources);
  }

  private void processColumnTagSources(
      ColumnsEntityInterface entity, TagAndTierSources tagAndTierSources) {
    for (Column column : entity.getColumns()) {
      processTagAndTierSources(column.getTags(), tagAndTierSources);
    }
  }

  private TagAndTierSources processTagAndTierSources(EntityInterface entity) {
    TagAndTierSources tagAndTierSources = new TagAndTierSources();
    processEntityTagSources(entity, tagAndTierSources);
    if (hasColumns(entity)) {
      processColumnTagSources((ColumnsEntityInterface) entity, tagAndTierSources);
    }
    return tagAndTierSources;
  }

  private String processTier(EntityInterface entity) {
    String tier = null;

    if (!NON_TIER_ENTITIES.contains(Entity.getEntityTypeFromObject(entity))) {
      tier = "NoTier";
    }

    Optional<List<TagLabel>> oEntityTags = Optional.ofNullable(entity.getTags());

    if (oEntityTags.isPresent()) {
      Optional<String> oEntityTier =
          getEntityTier(oEntityTags.get().stream().map(TagLabel::getTagFQN).toList());
      if (oEntityTier.isPresent()) {
        tier = oEntityTier.get();
      }
    }
    return tier;
  }

  private Optional<String> getEntityTier(List<String> entityTags) {
    Optional<String> entityTier = Optional.empty();

    List<String> tierTags = entityTags.stream().filter(tag -> tag.startsWith("Tier")).toList();

    // We can directly get the first element if the list is not empty since there can only be ONE
    // Tier tag.
    if (!tierTags.isEmpty()) {
      entityTier = Optional.of(tierTags.get(0));
    }

    return entityTier;
  }

  private List<Map<String, Object>> generateDailyEntitySnapshots(
      Map<String, Object> entityVersionMap) {
    Long startTimestamp = (Long) entityVersionMap.remove("startTimestamp");
    Long endTimestamp = (Long) entityVersionMap.remove("endTimestamp");

    List<Map<String, Object>> dailyEntitySnapshots = new java.util.ArrayList<>();

    Long pointerTimestamp = endTimestamp;

    while (pointerTimestamp >= startTimestamp) {
      Map<String, Object> dailyEntitySnapshot = new HashMap<>(entityVersionMap);

      dailyEntitySnapshot.put(
          TIMESTAMP_KEY, TimestampUtils.getStartOfDayTimestamp(pointerTimestamp));
      dailyEntitySnapshots.add(dailyEntitySnapshot);

      pointerTimestamp = TimestampUtils.subtractDays(pointerTimestamp, 1);
    }
    return dailyEntitySnapshots;
  }

  @Override
  public void updateStats(int currentSuccess, int currentFailed) {
    getUpdatedStats(stats, currentSuccess, currentFailed);
  }

  @Override
  public StepStats getStats() {
    return stats;
  }

  @Getter
  public static class TagAndTierSources {
    private final Map<String, Integer> tagSources;
    private final Map<String, Integer> tierSources;

    public TagAndTierSources() {
      this.tagSources = new HashMap<>();
      this.tierSources = new HashMap<>();
    }
  }
}
